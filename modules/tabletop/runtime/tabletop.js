/* ════════════════════════════════════════════════════════════════════════
   Amatlas 跑团模块 · 运行时 (tabletop/runtime/tabletop.js) — S9
   ════════════════════════════════════════════════════════════════════════
   实现 ../../core/module-interface.md 契约的**第二个、不同类型的**模块:
   为 node.kind='encounter' 提供 render / actions / systems。**DOM-free**、零依赖。

   它是 S8.5(统一 use + 多呈现器 + View scene/audio 意图)的**第一个真实客户**:
   · 注册走**统一入口** `engine.use(createTabletopModule(opts))`:模块工厂返回的对象带 `install`,
     内部调 api.registerModule(mod)——registerModule 是契约 §2.2 的底层原语;
     故"用 use 注册玩法模块" **无需改核心**(S11-b-ex 统一后核心算法仍零改)。
   · render 产出 **scene/audio 意图**(契约 §4.2 词汇;S9 据此定稿):节点静态意图
     + 检定当帧的骰子意图,交 SVG / Web Audio 呈现器各自消费;模块**不画 SVG、不发声**(意图非素材)。

   设计依据(均已查证):
   · Citizen Sleeper / Disco Elysium:**技能检定 vs 难度(DC)替代战斗**、时钟/资源驱动叙事。
   · ECS:**角色卡 = 组件**(挂在 state.sheet,随档),**检定 = 系统/规则**(经核心服务 api.dice/clock 组合)。
   · 契约 §五 事件总线:检定 emit('check') → 后果/时钟/成就经事件松耦合串接(系统间不直接依赖)。

   与文字冒险的**有意分工**(展示核心/模块边界):
   · **移动**用核心 `node.exits`(类型无关的"门",可带 available 门控)——模块不产移动动作。
   · **检定**用模块 `node.checks` → 模块在 actions() 里产出"掷骰"动作(这才是跑团专属语义)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else (global.Amatlas = global.Amatlas || {}).Tabletop = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // 缺省角色卡(游戏可经 opts.sheet 覆盖)。skills=技能调整值,resources=可消耗资源。
  var DEFAULT_SHEET = { name: '醒转者', skills: { 体魄: 1, 感知: 2, 交涉: 0 }, resources: { 状态: 3 } };

  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }   // 小数据深拷(避免共享 world/opts 引用)

  // look 解析(与文字冒险同语义,但**不依赖**该模块——跑团自含一份小工具,避免跨模块耦合)。
  function resolveLook(look, state, isFirst, eng) {
    if (typeof look === 'function') return look(state, isFirst, eng) || '';
    if (look && typeof look === 'object') return (isFirst ? look.first : (look.return || look.first)) || '';
    return look || '';
  }

  // 'NdS' → {n, sides};**未指定**缺省 2d6(经典 PbtA/Citizen Sleeper 风,有意默认)。仅解析,真随机用核心 api.dice(确定性、随档复现)。
  // fail-loud(design-principles §6b ⑩):**给了但非法**(如 '1d 20'/'d6'/'2d')旧版静默回退 2d6 → 作者以为掷的骰和实际不符。非法即抛。
  function parseDice(spec) {
    if (spec == null) return { n: 2, sides: 6, keep: null, keepN: 2 };
    // v17:NdS,或 NdS + kh/kl K(取高/取低 K 颗,如 4d6kh3 属性生成、2d20kh1 优势骰)。keep 缺省取全(=求和)。
    var m = /^(\d+)d(\d+)(?:(kh|kl)(\d+))?$/.exec(String(spec));
    if (!m) throw new Error('[amatlas] tabletop:检定 dice 格式非法 "' + spec + '"(应为 NdS〔如 2d6 / 1d20〕,或 NdS+kh/klK 取高/低 K 颗〔如 4d6kh3 / 2d20kh1〕)。旧版静默回退 2d6 → 作者以为掷的骰和实际不符。');
    var n = +m[1], keep = m[3] ? m[3].charAt(1) : null, keepN = m[4] != null ? +m[4] : n;
    if (keep && (keepN < 1 || keepN > n)) throw new Error('[amatlas] tabletop:检定 dice "' + spec + '" 的 ' + m[3] + ' 取舍数 ' + keepN + ' 必须在 1..' + n + '(骰数)之间。');
    return { n: n, sides: +m[2], keep: keep, keepN: keepN };
  }
  // 骰子规格的人类可读串(含 kh/kl;供检定行显示)
  function diceLabel(d) { return d.n + 'd' + d.sides + (d.keep ? ('k' + d.keep + d.keepN) : ''); }

  function nodeTitle(node) { return node.title != null ? node.title : (node.name != null ? node.name : ''); }

  function createTabletopModule(opts) {
    opts = opts || {};
    var ENG = null;
    var lastCheck = null;   // 瞬时"呈现帧产物"(仿文字冒险 pendingBeats):最近一次检定结果;render 读后清空,**不入档**
    var pendingMsgs = [];   // v11:link.run 返回的回应文本(契约 §4.3 通用语义,对称 text-adventure 的 pendingBeats);render 消费即清、不入档
    var transientOwner = null; // 瞬时帧归属的 state 对象；同节点 load 会换 state 引用，旧帧不得污染恢复视图
    var warned = {};        // fail-loud §6b ⑩:坏 cost.res / 空后果检定 只 warn 一次(防自动游玩/重渲染刷屏)
    function warn(msg) { if (typeof console !== 'undefined' && console.warn) console.warn(msg); }
    function clearTransient() {
      lastCheck = null;
      pendingMsgs = [];
      transientOwner = null;
    }
    function ownTransient(state) {
      if (transientOwner !== state) clearTransient();
      transientOwner = state;
    }

    function mapName(state) { var m = ENG && ENG.world.maps[state.pos.map]; return (m && m.name) || ''; }

    // 角色卡 = 组件:懒初始化进 state(→ 随档)。一处 getSheet 兜底,render/检定/系统共用。
    function getSheet(state) {
      if (!state.sheet) state.sheet = clone(opts.sheet || DEFAULT_SHEET);
      return state.sheet;
    }

    // 掷一个骰规格 → {sum, maxNat, minNat}。无 keep:ENG.dice 求和(=旧行为)。有 kh/kl:逐颗经累加器掷(同 rng 消费数)、
    //   排序取高/低 K 颗求和;maxNat/minNat=取舍颗数的满/空(供 crit/fumble 判定)。确定性:逐颗 ENG.dice(1,sides) 入档复现。
    function rollSpec(d) {
      if (!d.keep) { var s = ENG.dice(d.n, d.sides); return { sum: s, maxNat: d.n * d.sides, minNat: d.n }; }
      var arr = [], i;
      for (i = 0; i < d.n; i++) arr.push(ENG.dice(1, d.sides));
      arr.sort(function (a, b) { return a - b; });
      var kept = d.keep === 'h' ? arr.slice(d.n - d.keepN) : arr.slice(0, d.keepN);
      var sum = 0; for (i = 0; i < kept.length; i++) sum += kept[i];
      return { sum: sum, maxNat: d.keepN * d.sides, minNat: d.keepN };
    }

    // 优势/劣势求值(布尔 或 (state)=>bool;优劣并存抵消=无)→ 'adv'/'dis'/null。
    //   actions() 用它在检定**按钮**上加显眼标记(端用户诉求:点检定前就该看到自己有没有优势,不能只在掷骰后的结果行尾标);
    //   口径与 performCheck 的 adv/dis 求值一致。
    function advOf(c, state) {
      var a = !!(c.advantage != null && (typeof c.advantage === 'function' ? c.advantage(state) : c.advantage));
      var d = !!(c.disadvantage != null && (typeof c.disadvantage === 'function' ? c.disadvantage(state) : c.disadvantage));
      return (a !== d) ? (a ? 'adv' : 'dis') : null;
    }

    function resolveBonus(c, state) {
      if (c.bonus == null) return 0;
      var value = typeof c.bonus === 'function' ? c.bonus(state) : c.bonus;
      if (typeof value !== 'number' || !isFinite(value)) {
        throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 bonus 必须是有限数字或 (state)=>有限数字，收到 ' + (typeof c.bonus === 'function' ? '函数返回 ' + String(value) : String(value)) + '。');
      }
      return value;
    }

    // 检定:roll(NdS,经核心确定性 RNG) + 技能调整 vs DC。成/败各自后果;每次尝试先付 cost(资源)→ 资源耗尽自然挡住重试。
    function performCheck(state, c) {
      var sheet = getSheet(state);
      // M1 条件骰(用户诉求:1d6 几乎不可能、捡到道具变 2d6 就有戏):dice 可为定值串 或 (state)=>'NdS'
      //   (随道具/前序选择改骰池;与 dc 函数形同族)。有效性在 actions() 已 throw 校验。
      var d = parseDice((typeof c.dice === 'function') ? c.dice(state) : c.dice);
      // M2 优势/劣势骰(D&D 5e):优势掷两次取高、劣势取低;优劣并存抵消=单骰。advantage/disadvantage = 布尔 或 (state)=>bool。
      var adv = !!(c.advantage != null && (typeof c.advantage === 'function' ? c.advantage(state) : c.advantage));
      var dis = !!(c.disadvantage != null && (typeof c.disadvantage === 'function' ? c.disadvantage(state) : c.disadvantage));
      // M2 优势/劣势 = **多掷一颗骰、保留最高/最低 N 颗**(N=原保留数 d.keepN):NdS → (N+1)dS kh/kl N。
      //   2d6→掷 3d6 留最高 2;**1d20→掷 2d20 留最高 1 = D&D 5e 优势**;劣势同理留最低。**骰子层面取舍**
      //   (而非"整池掷两次取高总和"——那是对『2d6 的和(2-12 当一个数)』做优势,会把两个 sum 并排显示得像两颗骰,端用户实测困惑)
      //   → 显示干净(骰面是单颗 dS 可达的点数)、还原 D&D、且直接复用 rollSpec 的 kh/kl 逐颗取舍。抵消(adv===dis)=原骰。
      var rs = (adv !== dis)
        ? rollSpec({ n: d.n + 1, sides: d.sides, keep: adv ? 'h' : 'l', keepN: d.keepN })
        : rollSpec(d);
      var roll = rs.sum;
      var mod = (sheet.skills && sheet.skills[c.skill]) || 0;
      // M4 道具/状态临时加值(在固定 skill mod 之外;数字 或 (state)=>number,如捡到符咒 +1)。
      var bonus = resolveBonus(c, state);
      var adj = mod + bonus;                              // 合并调整值(技能 + 临时加值),供 total 与玩家可见的检定行
      var total = roll + adj;
      var dc = (typeof c.dc === 'function') ? c.dc(state) : c.dc;   // dc 可为数字 或 (state)=>number(动态难度;有效性 actions() 已校验)
      var ok = total >= dc;
      // 暴击/大失败(契约 v7):掷出最大(取舍后所有骰满)且成功→'crit';掷出最小且失败→'fumble';否则普通成/败。
      //   诚实:极值只在与成/败一致时点亮。kh/kl 下 maxNat/minNat=取舍颗数×面 / 取舍颗数(rollSpec 给)。vstate 服务骰子着色(present-svg)。
      var vstate = ok ? (roll === rs.maxNat ? 'crit' : 'success') : (roll === rs.minNat ? 'fumble' : 'fail');
      // M5b 部分成功(PbtA 7-9 / Blades 4-5「成功但有代价」):失败但接近(total 落 [dc-band, dc) 且非大失败)→ 走 c.partial(若声明)。
      //   band 缺省 2(c.partialBand 可调,PbtA 风可设 3);opt-in,不声明 c.partial → 缺省零行为变化。
      var pband = (typeof c.partialBand === 'number') ? c.partialBand : 2;
      var isPartial = !ok && !!c.partial && vstate !== 'fumble' && total >= dc - pband;
      // 后果档(tier):决定走哪个后果对象 + 检定行标签;crit/fumble/partial 缺省降级 success/fail(向后兼容)。
      var tier = ok ? ((vstate === 'crit' && c.crit) ? 'crit' : 'success')
        : (vstate === 'fumble' && c.fumble) ? 'fumble' : (isPartial ? 'partial' : 'fail');
      // 付出尝试代价(任何成败都付;放在检定级,非后果级)
      if (c.cost && sheet.resources && sheet.resources[c.cost.res] != null) {
        // amount != null 判而非 ||:amount:0(展示资源关联但免费)是合法值;`|| 1` 会把它静默当 1 扣(§9)。0 生效=不扣;缺省仍 1。
        sheet.resources[c.cost.res] = Math.max(0, sheet.resources[c.cost.res] - (c.cost.amount != null ? c.cost.amount : 1));
      }
      var outcome = (tier === 'crit' ? c.crit : tier === 'fumble' ? c.fumble : tier === 'partial' ? c.partial : tier === 'success' ? c.success : c.fail) || {};
      if (outcome.flag) state.flags[outcome.flag] = true;        // 后果:置 flag(门控移动/解锁)
      if (outcome.clock) ENG.clock.advance(outcome.clock);       // 后果:推进时钟(单调只增)
      if (outcome.set) for (var k in outcome.set) if (Object.prototype.hasOwnProperty.call(outcome.set, k)) state.flags[k] = outcome.set[k];
      ownTransient(state);
      lastCheck = { skill: c.skill, dice: diceLabel(d), sides: d.sides, roll: roll, mod: adj, total: total, dc: dc, ok: ok, vstate: vstate, tier: tier, text: outcome.text || '', adv: (adv !== dis) ? (adv ? 'adv' : 'dis') : null };
      ENG.emit('check', { skill: c.skill, dc: dc, roll: roll, mod: adj, total: total, ok: ok });  // 事件总线:供成就/其它系统松耦合订阅(mod=技能+临时加值)
      // v12:检定后果分支 success.to / fail.to = 一等公民(调研定稿:Ink conditional divert / ChoiceScript *goto /
      //   Fallen London challenge 成败各带跳转 / Disco Elysium 红白检定分支同款;fail forward——失败也把剧情推向
      //   新处境而非原地卡死)。返回目的地,由 actions() 的 run 闭包补到 action.to → 核心 apply 走标准移动路径。
      return outcome.to;
    }

    var TIER_LABEL = { crit: '暴击成功', success: '成功', partial: '部分成功', fumble: '大失败', fail: '失败' };
    function checkLine(lc) {
      // M2 优势/劣势:**只在检定行尾部标 (优势)/(劣势)**;骰面 `lc.roll` = 保留下来的那次结果(合法 NdS 和)。
      //   不展开"取高 a,b→kept" 两次 sum——对 2d6 这类**多骰求和**池,两个 sum(各 2-12)并排会被误读成"两颗骰子"
      //   (端用户实测:「2d6(取高 5,12) 为什么会有 12」= 把 pool sum 当单骰)。骰面只给结果、尾标优劣势,最不易误解。
      var advTag = lc.adv === 'adv' ? ' (优势)' : lc.adv === 'dis' ? ' (劣势)' : '';
      return lc.skill + '检定 ' + lc.dice + '(' + lc.roll + ')' + (lc.mod >= 0 ? '+' : '') + lc.mod
        + ' = ' + lc.total + (lc.ok ? ' ≥ ' : ' < ') + 'DC ' + lc.dc + advTag + ' → ' + (TIER_LABEL[lc.tier] || (lc.ok ? '成功' : '失败'));
    }

    function buildStatus(state, node) {
      var sheet = getSheet(state);
      var bits = [{ label: '所在', value: mapName(state) + ' · ' + nodeTitle(node) }];
      var res = sheet.resources || {};
      for (var r in res) if (Object.prototype.hasOwnProperty.call(res, r)) bits.push({ label: r, value: String(res[r]) });
      bits.push({ label: '回合', value: String(state.clock.t) });
      var sk = sheet.skills || {};
      for (var s in sk) if (Object.prototype.hasOwnProperty.call(sk, s)) bits.push({ label: s, value: (sk[s] >= 0 ? '+' : '') + sk[s] });
      if (typeof opts.status === 'function') (opts.status(state) || []).forEach(function (b) { if (b != null) bits.push(typeof b === 'string' ? { value: b } : b); });
      return bits;
    }

    var mod = {
      id: 'tabletop',
      nodeKinds: ['encounter'],   // 不同于文字冒险的 'scene' —— 证明 kind→模块 路由对"新类型"成立

      init: function (api) { ENG = api; },

      // 进入即确保角色卡在 state(随档);也演示 systems 订阅核心 enter 事件。
      // M2(检定结果可见性):离开任何节点(点「继续」或核心 exit)即清掉延迟跳转 → 不残留、不重复扣费。
      systems: [{ on: 'enter', run: function (state) {
        getSheet(state);
        state._ttPending = null;
        // lastCheck/pendingMsgs 是上一节点尚未被 render 消费的瞬时帧产物；enter/reset 是明确边界，必须清空。
        clearTransient();
      } }],

      render: function (state, node) {
        var isFirst = ENG ? ENG.firstTime() : true;
        var body = [];
        var prose = resolveLook(node.look, state, isFirst, ENG);
        if (prose) body.push({ type: 'prose', text: prose });

        var ownsTransient = transientOwner === state;
        var lc = ownsTransient ? lastCheck : null;
        if (ownsTransient) lastCheck = null;          // 只消费当前 state 所属帧；hydrate 的新引用绝不拿旧会话结果
        if (lc) {
          body.push({ type: 'check', text: checkLine(lc) });        // 机械结果(骰面/调整/DC/成败)
          if (lc.text) body.push({ type: 'outcome', text: lc.text }); // 叙事后果
        }
        // v11 对称修(审计实锤:契约 §4.3 把「link.run 返回 string=回应」写成通用语义,却只有 text-adventure 捕获,
        //   encounter 节点的回应被静默丢弃=round12"选项没反应"在跑团的活体):同 lastCheck 的瞬时帧产物语义,显示一次即清。
        if (ownsTransient && pendingMsgs.length) { pendingMsgs.forEach(function (t) { body.push({ type: 'outcome', text: t }); }); pendingMsgs = []; }
        if (ownsTransient && !lastCheck && !pendingMsgs.length) transientOwner = null;

        // scene 意图 = 节点静态意图 + 本帧骰子意图(克隆,绝不改 world 数据)。意图非素材:presenter 决定怎么画。
        var scene = node.scene ? clone(node.scene) : null;
        if (lc) {
          scene = scene || {};
          scene.elements = (scene.elements || []).concat([{ kind: 'dice', ref: String(lc.total), sides: lc.sides, state: lc.vstate }]);   // issue3:骰子显示**最终鉴定值**(roll+技能/道具加值),不是裸骰点 → 玩家看到的数字=拿去比 DC 的数字。大成功/大失败仍走 state(present-svg 金光/红裂视觉)+ 检定行 tier 文字标示,**不切回自然骰**(用户拍板:视觉表暴击、骰面留总值)。v7:传 sides 选骰形 + 四态特效。
        }
        // audio 意图 = 节点静态 bgm + 本帧检定音效(dice-roll + 成/败)。SFX_SPEC 已含这三个名(present-audio.js)。
        var audio = node.audio ? clone(node.audio) : null;
        if (lc) {
          audio = audio || {};
          audio.sfx = (audio.sfx || []).concat(['dice-roll', lc.ok ? 'success' : 'fail']);
        }

        var view = { mapname: mapName(state), title: nodeTitle(node), body: body, status: buildStatus(state, node) };
        if (scene) view.scene = scene;   // 缺省不带 → 无 SVG 呈现器时优雅退化为纯文字
        if (audio) view.audio = audio;
        // v18:检定/带回应 link 的「结果帧」(_ttPending=等点「继续 →」走到 success.to/fail.to)→ 标 suppressExits,
        //   核心本帧不并入 node.exits 的移动 = 只剩「继续 →」。防玩家改点旁路 exit 绕过 fail.to 后果 / 退回去重摇检定
        //   (engine-core.js view() 永远并入 defaultMoves,模块无法自行抑制 → 经此 View 标位告诉核心)。
        if (state._ttPending != null) view.suppressExits = true;
        return view;
      },

      // 检定 → 动作(掷骰)。移动不在此(走核心 exits)。成功置 flag 后该检定隐去;资源足→可点、不足→默认隐。
      // 死局安全网(契约 §4.5,对称 text-adventure 的隐藏项灰显):**无可点检定 且 无可点核心出口**(真死局)时,
      //   把因资源不足而隐的检定灰显出来 → 避免 encounter 空场景(让玩家看到卡在资源,而非一片空白)。
      actions: function (state, node) {
        var sheet = getSheet(state);
        var out = [], starved = [];
        // M2(检定结果可见性,docs/tabletop-check-result-visibility-design.md):上一个检定 / 带回应的 link 产生了
        //   延迟跳转 → 本帧只给「继续」。机制:apply 见 action.to 空 → 原地重渲染 → tabletop.render 在源节点先把
        //   骰子+检定行+后果文本+音效显示出来(消费 lastCheck/pendingMsgs),玩家读完再点「继续」走到目的地。
        //   修「success.to 指向 scene 节点时 tabletop.render 在目的地不跑 → 检定结果跨模块不可见 + 串到下个 encounter」。
        //   _ttPending 入档(随存档)→ 刷新/读档不丢失、不重复扣费;on:'enter' 系统在离开节点时清空它。
        //   注:核心 defaultMoves(node.exits)仍由 view() 在模块 actions 之外并入(读完结果后另选退路的导航自由);
        //   本帧只抑制「重复检定」,不抑制核心出口(模块无法、也不应越过核心控制出口)。
        if (state._ttPending != null) {
          return [{ id: '__tt_continue', label: '继续 →', kind: 'act', to: state._ttPending, available: function () { return true; } }];
        }
        if (node.checks != null && !Array.isArray(node.checks)) throw new Error('[amatlas] tabletop:节点 checks 必须是数组(哪怕只有一个检定也写成 checks:[{…}]),收到 ' + typeof node.checks + '。');
        (node.checks || []).forEach(function (c, idx) {
          var id = c.id != null ? c.id : ('check:' + idx);
          // fail-loud(round7 #2/#3/#4):check 字段别名/错形态违约 → 报错教正名(只校验形式,不碰检定内容)。
          //   弱模型按命令式直觉写 name/onSuccess/skill 函数,Amatlas 契约是声明式 label/success 对象/技能名字符串 → 全静默失效。
          if (c.label == null) throw new Error('[amatlas] tabletop:检定「' + id + '」缺少 label(按钮文字)' + (c.name != null ? '(你写了 name,应改名为 label)' : '') + ':否则检定按钮文字空白。');
          if (c.onSuccess != null || c.onFailure != null) throw new Error('[amatlas] tabletop:检定「' + c.label + '」用了 onSuccess/onFailure 回调,但检定后果字段是 success/fail 对象(如 success:{flag:"x",text:"…",clock:1});回调会被忽略 → 检定无任何后果。改用 success/fail。');
          if (typeof c.skill === 'function') throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 skill 写成了函数,但 skill 是角色卡技能名(字符串,查 sheet.skills 得调整值);难度请用 dc/dice 表达,别把数值塞进 skill 函数。');
          // fail-loud:dc 解析后必须是有限数字。dc 可为数字、或 (state)=>number(动态难度,与 look/requires 同族)。
          //   写成字符串/缺失、或函数返回非数 → performCheck 里 total>=dc 恒 NaN = **检定永远失败**(静默;showcase round9 实测:dc:(S)=>… 想做递减难度,被 `total>=函数`=NaN 吞成永败)。
          var _dc = (typeof c.dc === 'function') ? c.dc(state) : c.dc;
          if (typeof _dc !== 'number' || !isFinite(_dc)) throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 dc 不是有限数字(收到 ' + (typeof c.dc === 'function' ? '函数返回 ' + _dc : typeof c.dc + ' "' + c.dc + '"') + ')。dc 必须是数字、或 (state)=>number(动态难度);否则 roll>=dc 恒 NaN = 检定永远失败。');
          // batch:引擎自动管 DC 提示(用户拍板治本)——检定按钮 label 据 skill+dc 自动拼「(技能·DC N)」后缀,作者 label 只写动作(如「撬开闸门」)。
          //   通过后的 :passed 按钮用**纯 label 不拼**(DC 已无意义、隐藏=用户诉求)。动态 dc 显当前求值 _dc。dcHint:false 关闭自动拼。
          //   兼容兜底:label 已手写「DC」→ 不拼(防重复;但官方范本/指引一律改纯动作 label,DC 交引擎)。
          var dcLabel = (c.dcHint === false || c.skill == null || /\bDC\b/i.test(String(c.label))) ? c.label : (c.label + '(' + c.skill + '·DC ' + _dc + ')');
          // round9 audit:弱模型把命令式 RPG 直觉套进声明式契约 → 下列错形态全静默失效,逐一 fail-loud(只校验形式、不碰内容)。
          // M1 条件骰 fail-loud:dice 是定值串 或 (state)=>'NdS';非串非函数 → 抛。函数形结果下方 parseDice 预校验(对齐 dc)。
          if (c.dice != null && typeof c.dice !== 'string' && typeof c.dice !== 'function') throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 dice 必须是 "NdS" 串(如 "2d6")或 (state)=>"NdS" 函数(条件骰池,如 (S)=>S.flags.hasKnife?"2d6":"1d6"),收到 ' + typeof c.dice + '。');
          parseDice((typeof c.dice === 'function') ? c.dice(state) : c.dice);   // 提前校验骰子规格(含函数形结果)→ 非法 NdS 即抛(对齐 :46,装配期抓而非点击期)
          // M2 优劣势 fail-loud:advantage/disadvantage = 布尔 或 (state)=>bool;写成定值数/串等 → 抛(否则形态错被静默忽略)。
          ['advantage', 'disadvantage'].forEach(function (k) {
            if (c[k] != null && typeof c[k] !== 'boolean' && typeof c[k] !== 'function') throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 ' + k + ' 必须是布尔 或 (state)=>bool(如 advantage:(S)=>!!S.flags.hasTorch),收到 ' + typeof c[k] + '。');
          });
          // M4 加值 fail-loud:预检与 performCheck 共用 resolver；执行时再验一次，防 action 生成后 state 改变导致函数返回坏值。
          resolveBonus(c, state);
          // M5b 部分成功 fail-loud:partialBand = 非负有限数字(失败但接近的带宽,缺省 2)。
          if (c.partialBand != null && (typeof c.partialBand !== 'number' || !isFinite(c.partialBand) || c.partialBand < 0)) throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 partialBand 必须是非负有限数字(部分成功带宽,缺省 2),收到 ' + c.partialBand + '。');
          // success/fail + M3 crit/fumble + M5b partial 都必须是后果对象(写成字符串 → 文本和后果全丢)。
          ['success', 'fail', 'crit', 'fumble', 'partial'].forEach(function (side) {
            if (c[side] != null && typeof c[side] !== 'object') throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 ' + side + ' 必须是对象 {text,set,flag,clock,to},收到 ' + typeof c[side] + ':写成字符串 → 文本和后果全丢。' + ((side === 'crit' || side === 'fumble' || side === 'partial') ? '(crit=自然最大且成功 / fumble=自然最小且失败 / partial=失败但接近〔成功有代价〕的专门后果,均可选;缺省降级 success/fail)' : '只想显文字就写 ' + side + ':{text:"…"}。'));
          });
          if ((c.flag != null || c.clock != null || c.set != null) && c.success == null && c.fail == null) throw new Error('[amatlas] tabletop:检定「' + c.label + '」的后果(flag/clock/set)写在了检定顶层,但后果必须放进 success/fail 对象(如 success:{flag:"x",clock:1})→ 否则掷骰后什么都不发生。');
          if (c.cost != null && typeof c.cost !== 'object') throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 cost 必须是对象 {res:"资源名",amount:n},收到 ' + typeof c.cost + ':写成数字 → 检定被当资源不足、永远点不动。');
          if (c.cost && c.cost.amount != null && (typeof c.cost.amount !== 'number' || !isFinite(c.cost.amount) || c.cost.amount < 0)) throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 cost.amount 必须是非负有限数字,收到 ' + c.cost.amount + ':非数会让资源变 NaN、负数反向加资源。');
          ['success', 'fail', 'crit', 'fumble', 'partial'].forEach(function (side) {
            var o = c[side];
            if (o && o.set != null && (Array.isArray(o.set) || typeof o.set !== 'object')) throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 ' + side + '.set 必须是对象 {键:值}(如 set:{won:true}),收到 ' + (Array.isArray(o.set) ? '数组' : typeof o.set) + ':写成数组会置出名为 0/1 的垃圾 flag、真 flag 从不置。');
            if (o && o.clock != null && (typeof o.clock !== 'number' || !isFinite(o.clock) || o.clock < 0)) throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 ' + side + '.clock 必须是有限非负数字(推进核心单调时钟),收到 ' + o.clock + '。');
          });
          // fail-loud(v12 对称穷举,sweep 证零误报):success/fail 是闭集后果词汇(text/set/flag/clock/to)——
          //   未知键(typo 如 sets、或不支持的意图)旧版被静默丢弃 → 点名抛 + 教正路。
          ['success', 'fail', 'crit', 'fumble', 'partial'].forEach(function (side) {
            var o = c[side]; if (!o || typeof o !== 'object') return;
            for (var kk in o) {
              if (!Object.prototype.hasOwnProperty.call(o, kk)) continue;
              if (kk === 'text' || kk === 'set' || kk === 'flag' || kk === 'clock' || kk === 'to') continue;
              throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 ' + side + '.' + kk + ' 不是契约字段(支持 text/set/flag/clock/to),会被静默丢弃。'
                + (kk === 'run' ? '复杂副作用请用 set:{键:值},或把该步骤做成 link(link.run 支持任意状态改动+返回回应文本)。'
                  : (/^(goto|node|target|next|dest|destination|move)$/.test(kk) ? '要"检定后跳转"用 to:\'节点id\'(同图)或 to:{map,node}(跨图)。' : '')));
            }
            if (o.to != null && typeof o.to !== 'string' && (typeof o.to !== 'object' || o.to.map == null || o.to.node == null))
              throw new Error('[amatlas] tabletop:检定「' + c.label + '」的 ' + side + '.to 必须是 \'节点id\'(同图)或 {map,node}(跨图),收到 ' + JSON.stringify(o.to) + '。');
          });
          if (c.requires != null) throw new Error('[amatlas] tabletop:检定「' + c.label + '」用了 requires,但检定的门控字段是 available(requires 是 links/出口的);requires 在检定上被静默忽略 → 门控失效。改用 available:(S)=>bool。');
          // R2 二轮:crit 是成功同族(暴击成功=契约一等成功档,结算同写 flag/set)。此前守卫只读 c.success →
          //   作者给 crit 独立 flag/set(契约鼓励、U5 测试即此写法)时,暴击一次守卫检测不到「已成功」→ 检定继续出现、
          //   无限重掷刷 cost.resources 软锁(commit 67e527f 的 success→crit 兄弟;repro _scratch/repro_crit_seam2.cjs)。
          var sideMet = function (o) { return !!(o && ((o.flag && state.flags[o.flag]) || (o.set && Object.keys(o.set).length && Object.keys(o.set).every(function (sk) { return state.flags[sk]; })))); };
          var wonSide = sideMet(c.crit) ? c.crit : (sideMet(c.success) ? c.success : null);   // 优先 crit(更高档),回退 success;二者任一命中 = 已成功
          if (wonSide) {                  // 已成功(`flag` 已置 **或** `set` 的键都已置)→ 不再重掷。set 写 state.flags 同 flag(:136),守卫一致对待——治「成功只写 success.set〔无 flag〕的检定 cost-bearing 却无 flag/to 守卫 → 通过后仍可无限重点扣资源」软锁(showcase《逝音录》decode 实锤:success.set:{filesDecrypted}+cost 精力、可刷空精力软锁后续结局)
            // 已挣得的前进路:仅当 success.to **独占** 一条前进路时才保留(治 wreck_crossing 类软锁:赢了却选撤退、再回来 success.to 没了 → 永久卡死;showcase round13 对抗核实实锤)。
            //   场景 A〔wreck_crossing 真场景〕:success.to='cross_done'、fail.to=null/'near' → success.to 独占 → 保留(防"赢了反而锁死")。
            //   场景 B〔普通通过性事件〕:success.to===fail.to(都到 corridor_a/lava_tunnel,Sonnet《深井回响》storage_bay/deep_junction 模式)→ 失败也能走到那里、不存在"赢了反而锁"的风险 →
            //     不保留(否则通过后回访只剩"检定 label 的 move 按钮"=空壳"回上一级",误导玩家)。
            //   判据 `failTo !== success.to`(含 fail 没写)= 严格 wreck 防御、不误伤普通事件。engine-core 零改、纯模块层加性。
            if (wonSide.to != null) {
              var fT = c.fail && c.fail.to;
              var sT = wonSide.to;   // R2 二轮:所中档(crit/success)的 .to 独占前进路才保留;crit.to 与 success.to 一并纳入
              var sameTo = (fT != null) && (
                (typeof fT === 'string' && typeof sT === 'string' && fT === sT) ||
                (typeof fT === 'object' && typeof sT === 'object' && fT && sT && fT.map === sT.map && fT.node === sT.node)
              );
              if (!sameTo) out.push({ id: id + ':passed', label: c.label, kind: 'move', to: sT, available: function () { return true; } });
            }
            return;
          }
          // fail-loud(design-principles §6b):available 门控非函数 = 违约。旧写法非函数 → && 短路 → 检定**无条件显示**(锁静默失效)。
          if (c.available != null && typeof c.available !== 'function') throw new Error('[amatlas] check.available 必须是 (state)=>bool 函数(检定「' + (c.label != null ? c.label : id) + '」),收到 ' + typeof c.available + ':写成定值会被静默忽略 → 门控失效。删掉=无条件,或改成函数。');
          if (typeof c.available === 'function' && !c.available(state)) return;               // 自定义不可用 → 隐去
          // fail-loud(§6b ⑩):cost.res 不在角色卡 resources → afford 读 0、被当"资源不足"灰显且永不可点(可能拼错资源名);warn 一次。
          if (c.cost && (!sheet.resources || sheet.resources[c.cost.res] == null) && !warned['res:' + c.cost.res]) {
            warned['res:' + c.cost.res] = 1;
            warn('[amatlas] tabletop:检定「' + (c.label != null ? c.label : id) + '」的 cost.res "' + c.cost.res + '" 不在角色卡 resources(现有:' + Object.keys(sheet.resources || {}).join('/') + ')→ 会被当资源不足、永不可点(可能拼错资源名)。');
          }
          // fail-loud(round4 N1,对称 cost.res):c.skill 不在角色卡 skills → `(sheet.skills[c.skill])||0` 静默按调整值 0 算、
          //   检定比设计更难(DC 没变、bonus 没了);弱模型易中/英文混用技能名。warn 一次。
          if (c.skill != null && !(sheet.skills && Object.prototype.hasOwnProperty.call(sheet.skills, c.skill)) && !warned['skill:' + c.skill]) {
            warned['skill:' + c.skill] = 1;
            warn('[amatlas] tabletop:检定「' + (c.label != null ? c.label : id) + '」的 skill "' + c.skill + '" 不在角色卡 skills(现有:' + Object.keys(sheet.skills || {}).join('/') + ')→ 调整值静默按 0 算、检定比设计更难。改用已有技能名,或在 sheet.skills 补上。');
          }
          // fail-loud(§6b ⑩):成败两侧都没后果 → 掷骰后什么都不发生(无意义检定);warn 一次。
          if (!c.success && !c.fail && !warned['empty:' + id]) {
            warned['empty:' + id] = 1;
            warn('[amatlas] tabletop:检定「' + (c.label != null ? c.label : id) + '」success 和 fail 都未定义 → 掷骰后无任何后果(无意义检定)。至少给一侧 text/flag/clock/set。');
          }
          // afford:区分「未声明该资源(配置缺失)」与「声明了但不够(真耗尽)」——
          //   **未声明** → 不当"不足"灰显(那是 fail-silent:配置缺失伪装成资源耗尽、检定永不可点;showcase 实测漏配 sheet / initState↔sheet 同名混淆即中)→ 能点、掷骰(该资源不扣;上面 warn 已提示去 sheet 配);
          //   **声明了且 < amount** → 真耗尽 → 灰显(保留资源经济:耗尽自然挡重试,见 G2)。"未声明 ≠ 用光了"。
          var resDeclared = !!(c.cost && sheet.resources && sheet.resources[c.cost.res] != null);
          var afford = !(resDeclared && sheet.resources[c.cost.res] < (c.cost.amount != null ? c.cost.amount : 1));   // amount:0=免费,资源 0 也可点(与扣费侧同判)
          if (afford) {
            out.push((function () {
              // M2:检定**不立即跳转**。run 跑 performCheck(设 lastCheck + 后果 flag/clock/cost),把目的地存进
              //   state._ttPending 而**非 act.to** → apply 因 action.to 空走原地重渲染 → tabletop.render 在源节点显示
              //   骰子+检定行+后果文本(消费 lastCheck)→ actions 本帧只给「继续」→ 点击后走标准移动路径(enter)。
              //   修「success.to/fail.to 指向 scene 节点时 tabletop.render 在目的地不跑 → 检定结果不可见 + 串台」。详见设计稿。
              var act = { id: id, label: dcLabel, kind: 'act', adv: advOf(c, state), available: function () { return true; } };   // dcLabel:作者动作 label + 自动 DC 后缀(见上)
              act.run = function (st) { var dest = performCheck(st, c); if (dest != null) st._ttPending = dest; };
              return act;
            })());
          } else {
            starved.push({ id: id, label: dcLabel, kind: 'act', locked: true,                // 资源不足 → 安全网候选(灰显,同样带 DC 后缀)
              lockHint: (c.cost ? (c.cost.res + '不足') : '资源不足'), available: function () { return true; } });
          }
        });
        // v6:encounter 的移动出口 = 核心 exits(defaultMoves)+ node.links(经 api.linkActions,与 text-adventure 统一)。
        //   原 tabletop 只认核心 exits、不认 links → 作者按文字冒险习惯用 links 时检定后静默无出口(round7 #5)。现统一复用。
        //   提前到死局判定之前取:links 可走时不是死局(易用性审计批——旧版死局判定只扫 exits,links 可走
        //   仍把「资源不足」灰条亮出来=误示死局)。
        var las = ENG.linkActions(node, state);
        if (!out.length && starved.length) {                                                 // 无可点检定 → 看出口(exits+links)是否也全锁
          // 注:此处 ex.available 是**核心 exits 字段**,"非函数即抛"由 engine-core view() 过滤器权威校验(actions() 返回后紧接 filter),故不在此重复守卫。
          var exitClickable = (node.exits || []).some(function (ex) {
            return ex && ex.to != null && (typeof ex.available !== 'function' || ex.available(state));
          }) || las.some(function (a) { return !a.locked; });
          if (!exitClickable) starved.forEach(function (a) { out.push(a); });                 // 真死局 → 灰显,不留空场景
        }
        // v11:包装捕获 link.run 返回的回应文本(契约 §4.3 通用语义;与 renderer.js actions() 的包装逐字对称——
        //   未来新模块复用 linkActions 时也要做这层捕获,见 plugin-development.md)。
        for (var li = 0; li < las.length; li++) (function (a) {
          if (typeof a.run !== 'function') return;
          var orig = a.run;
          // M2 对称:带文字回应的移动型 link 也延迟跳转 → 回应先在源节点显示(消费 pendingMsgs),再「继续」。
          //   无回应的纯移动 link 不受影响(r 非字符串 → 保留 a.to 自动跳)。根治 pendingMsgs 同族跨模块泄漏(本作 latent)。
          a.run = function (st) { var r = orig(st); if (typeof r === 'string' && r) { ownTransient(st); pendingMsgs.push(r); if (a.to != null) { st._ttPending = a.to; a.to = undefined; } } return r; };
        })(las[li]);
        return out.concat(las);
      }
    };
    // S11-b-ex:模块工厂返回 use-able 插件 → `engine.use(createTabletopModule(opts))` 唯一形态;
    //   registerModule 降为 install 调用的底层原语(契约 v4 §2.2)。已删去旧 tabletopPlugin 包装。
    mod.install = function (api) { api.registerModule(mod); };
    return mod;
  }

  return { createTabletopModule: createTabletopModule, resolveLook: resolveLook, parseDice: parseDice };
});
