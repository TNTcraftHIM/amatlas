/* ════════════════════════════════════════════════════════════════════════
   Amatlas 跑团 demo 世界数据(tabletop 模块)—— S9 垂直切片 + 可通关性修复。
   ════════════════════════════════════════════════════════════════════════
   节点 kind='encounter'(由 tabletop 模块负责)。作者只写"数据",引擎是解释器。
   一个 Citizen Sleeper 风的微型切片:醒转在废弃空间站,靠**技能检定 vs 难度**推进——
   感知扫描(可选)→ 体魄撬闸 → 交涉唤醒舱站 AI,抵达两种结局之一。

   ★ 资源经济的正确示范(2026-06-14 修「无法通关」soft-lock):
     · **必经检定**(force 撬闸 / talk 谈判)= **免费**(cost.amount:0,展示与"状态"相关但不扣)
       且 **fail-forward**(success.to / fail.to 都把剧情往前推)——骰子定的是**走向**(和平/强夺
       两个结局),不是"过/不过"开关。失败不卡死、不靠资源把人堵在主线上。
       (LucasArts no-dead-ends / Disco Elysium 红白检定分叉;引擎 tabletop v12 已为此支持 success.to/fail.to。)
     · **资源(状态)= 可选检定的赌注 / 探索预算**:只有可选的 scan 花"状态"。它紧张时影响"你能
       多冒几次险/拿多少线索",但**绝不堵死主线**——这才是 Citizen Sleeper/PbtA 资源经济的本意。
     · 旧版 bug:force/talk 既扣资源又只"成功"才解锁出口、全引擎无资源回复 → 两次失败即耗尽、
       必经检定灰显、永久 soft-lock(实测该 seed 确定性卡死)。详见 journal/lessons。

   要素:角色卡经 game.js 的 boot(…{sheet}) 注入(不在世界数据里);
   节点写 look(散文)/ checks(检定:免费必经 + 计费可选)/ exits(核心移动)/ scene·audio(意图)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.TABLETOP_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    id: '799b8b57-78db-4901-9381-42a339525aa0',
    start: { map: 'station', node: 'bay' },
    seed: 20260531,
    maps: {
      station: {
        name: '废弃空间站「灯塔」',
        nodes: {

          bay: {
            kind: 'encounter',
            title: '醒转舱',
            map: { x: 22, y: 78 },                           // 玩家地图坐标(0–100 归一,模块私有;给 minimap spatial 视图摆位)
            scene: { region: 'room', mood: 'calm' },        // 静态意图:SVG 画室内、平静色调
            audio: { bgm: 'theme-calm' },                    // 静态意图:Web Audio 起平静 bgm
            look: { first: '低温舱嘶地开启,你在一片白雾里睁开眼。冷却液的味道,和很远处一声金属的呻吟。',
                    return: '醒转舱还开着。雾气早已散尽,只剩你呼吸的回声。' },
            checks: [
              // ★ 可选检定:花"状态"赌线索。成败都不卡主线(force/talk 免费),失败也给一点信息(非纯惩罚)。
              { id: 'scan', label: '凝神感知周围', skill: '感知', dc: 6, dice: '2d6',   // label 只写动作;引擎据 skill+dc 自动拼「(感知·DC 6)」、通过后隐藏(耗状态由节点语境体现)
                cost: { res: '状态', amount: 1 },
                success: { text: '你认出这是环轨站「灯塔」——堆芯应该还有余电。', set: { knows: true } },
                fail: { text: '记忆一片空白。但你摸到舱壁一道新刻的痕——有人在你之前来过这里。' } }
            ],
            exits: [ { to: 'gate', label: '走向坍缩的气闸' } ]
          },

          gate: {
            kind: 'encounter',
            title: '坍缩的气闸',
            map: { x: 50, y: 50 },
            scene: { region: 'cave', mood: 'tense' },
            audio: { bgm: 'theme-tense' },
            look: '一道变形的合金门半卡在轨道上,门缝里漏出幽蓝的光。',
            checks: [
              // ★ 必经检定:免费(amount:0)+ fail-forward(成败都进堆芯)。成功=巧劲撬开(记 gateOpen,供成就);失败=砸开,警报大作、推进时钟。
              // v16 演示:① advantage(前序选择改检定)——先 scan 过(knows)就知道舱门结构 → 撬门有优势(掷两次取高);
              //   ② crit/fumble 叙事分支(可选,缺省降级 success/fail)——自然 12 悄无声息撬开、自然 2 撬棍崩断更糟。
              { id: 'force', label: '撬开舱门', skill: '体魄', dc: 8, dice: '2d6',
                cost: { res: '状态', amount: 0 },
                advantage: function (S) { return !!(S.flags && S.flags.knows); },
                success: { text: '金属呻吟着让开一道缝——刚够一个人钻过去。', flag: 'gateOpen', clock: 1, to: 'core' },
                crit: { text: '你一眼看穿卡死的铰链,精准一撬——门悄无声息地滑开,没惊动任何警报。', flag: 'gateOpen', set: { quietEntry: true }, to: 'core' },
                fail: { text: '门纹丝不动……你索性砸碎控制盒,门轰然炸开,警报随之尖啸。', clock: 2, to: 'core' },
                fumble: { text: '撬棍崩断,碎片划伤了你——门炸开时,警报与血腥味一起涌来。', clock: 3, to: 'core' } }
            ],
            exits: [ { to: 'bay', label: '退回醒转舱' } ]
          },

          core: {
            kind: 'encounter',
            title: '反应堆堆芯',
            map: { x: 78, y: 24 },
            scene: { region: 'night', mood: 'eerie', elements: [ { kind: 'character', ref: '休眠 AI' } ] },
            audio: { bgm: 'theme-night' },
            look: function (S) {
              return '幽蓝的辉光里,一台休眠的舱站 AI 缓缓睁开光学传感器。'
                + (S.flags.knows ? '\n你记得它的名字——「灯塔」。' : '');
            },
            checks: [
              // ★ 必经检定:免费 + fail-forward 进**不同结局**(骰子定走向,不定成败)。
              { id: 'talk', label: '表明身份,与 AI 谈判', skill: '交涉', dc: 7, dice: '2d6',
                cost: { res: '状态', amount: 0 },
                success: { text: '「……授权确认。欢迎回来,船长。」环轨的灯一盏盏次第亮起。', to: 'ending-peace' },
                fail: { text: '「身份不符——启动应急接管。」红光锁定你,你扑向主控,强行注入旧密钥。', to: 'ending-force' } }
            ],
            exits: [ { to: 'gate', label: '退回气闸' } ]
          },

          // ── 结局节点(kind:'encounter'、无 checks 无 exits = 通关终点;graph-audit 报 P2 死胡同=结局预期,同 arcade vault)──
          'ending-peace': {
            kind: 'encounter',
            title: '重新点亮的灯塔',
            map: { x: 92, y: 10 },
            scene: { region: 'night', mood: 'calm' },
            audio: { bgm: 'theme-calm' },
            look: '环轨缓缓转动,灯塔的每一盏灯都亮了。AI 的声音平静下来:「系统在线。我们回家吧,船长。」\n\n—— 通关:你唤醒了灯塔。点击上方「重新开始」再来一次。'
          },

          'ending-force': {
            kind: 'encounter',
            title: '强行接管的灯塔',
            map: { x: 92, y: 40 },
            scene: { region: 'night', mood: 'eerie' },
            audio: { bgm: 'theme-tense' },
            look: '红光熄灭,主控权回到你手里——代价是 AI 永远沉默了。灯一盏盏亮起,寂静而冰冷。\n\n—— 通关:你夺回了灯塔,却失去了它的声音。点击上方「重新开始」再来一次。'
          }

        }
      }
    }
  };
});
