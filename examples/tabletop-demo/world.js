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

  function flags(S) { return (S && S.flags) || {}; }
  function resource(S, name) {
    return S && S.sheet && S.sheet.resources && typeof S.sheet.resources[name] === 'number'
      ? S.sheet.resources[name]
      : 0;
  }

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
            look: function (S, first) {
              var opening = first
                ? '低温舱嘶地开启,你在一片白雾里睁开眼。冷却液的味道,和很远处一声金属的呻吟。'
                : '醒转舱还开着。雾气早已散尽,只剩你呼吸的回声。';
              return opening + (flags(S).scanned ? '' : '\n凝神扫描会消耗 1 点状态；也可以保留体力,直接走向气闸。');
            },
            checks: [
              // ★ 可选检定:花 1 状态换线索与后续优势；无论成败只尝试一次，不把资源刷空。
              { id: 'scan', label: '凝神感知周围', skill: '感知', dc: 6, dice: '2d6',
                cost: { res: '状态', amount: 1 },
                available: function (S) { return !flags(S).scanned; },
                success: { text: '状态 −1。你认出这是环轨站「灯塔」——堆芯应该还有余电。', set: { scanned: true, knows: true } },
                fail: { text: '状态 −1。记忆仍一片空白,但舱壁的新刻痕说明有人先来过。', set: { scanned: true } } }
            ],
            exits: [ { to: 'gate', label: '走向坍缩的气闸' } ]
          },

          gate: {
            kind: 'encounter',
            title: '坍缩的气闸',
            map: { x: 50, y: 50 },
            scene: { region: 'cave', mood: 'tense' },
            audio: { bgm: 'theme-tense' },
            look: function (S) {
              if (flags(S).alarmed) return '控制盒已被砸碎,警报仍沿着气闸尖啸。门终于开了,代价也已经发生。';
              if (flags(S).gateOpen) return '你沿着扫描记下的支点安静撬开了气闸,门缝刚够一个人钻过。';
              return '一道变形的合金门半卡在轨道上,门缝里漏出幽蓝的光。';
            },
            checks: [
              // ★ 必经检定:免费 + fail-forward。花状态完成的 scan 会在按钮上给优势；固定旅程因此成功，否则警报中失败前进。
              { id: 'force', label: '撬开舱门', skill: '体魄', dc: 9, dice: '2d6',
                cost: { res: '状态', amount: 0 },
                available: function (S) { return !flags(S).gateResolved; },
                advantage: function (S) { return !!flags(S).knows; },
                success: { text: '你沿着受力点撬动,金属安静让开一道缝。', clock: 1, set: { gateResolved: true, gateOpen: true }, to: 'core' },
                fail: { text: '门纹丝不动……你索性砸碎控制盒,门轰然炸开,警报随之尖啸。', clock: 2, set: { gateResolved: true, alarmed: true }, to: 'core' } }
            ],
            exits: [
              { to: 'bay', label: '退回醒转舱' },
              { to: 'core', label: '穿过已经打开的气闸', available: function (S) { return !!flags(S).gateResolved; } }
            ]
          },

          core: {
            kind: 'encounter',
            title: '反应堆堆芯',
            map: { x: 78, y: 24 },
            scene: { region: 'night', mood: 'eerie', elements: [ { kind: 'character', ref: '休眠 AI' } ] },
            audio: { bgm: 'theme-night' },
            look: function (S) {
              var f = flags(S);
              if (f.aiTrusted) return '灯塔已经确认你的授权。光学传感器由警戒红转为温和的蓝,等待你完成唤醒。';
              if (f.emergencyOverride) return '谈判只换来片刻迟疑。应急接管已经写入主控,红光下只剩最后一步。';
              return '幽蓝的辉光里,一台休眠的舱站 AI 缓缓睁开光学传感器。'
                + (f.knows ? '\n你记得它的名字——「灯塔」。' : '')
                + (f.alarmed ? '\n气闸警报抢先传来,它的镜头立刻转为戒备红。' : '');
            },
            checks: [
              // ★ 必经检定:警报抬高 DC；保留的状态提供 +1 谈判余力。只差一点时走带代价的 partial fail-forward。
              { id: 'talk', label: '表明身份,与 AI 谈判', skill: '交涉',
                dc: function (S) { return flags(S).alarmed ? 11 : 8; }, dice: '2d6',
                bonus: function (S) { return resource(S, '状态') >= 3 ? 1 : 0; },
                partialBand: 1,
                cost: { res: '状态', amount: 0 },
                available: function (S) { var f = flags(S); return !f.aiTrusted && !f.emergencyOverride; },
                success: { text: '「……授权确认。欢迎回来,船长。」环轨的灯一盏盏次第亮起。', set: { aiTrusted: true }, to: 'ending-peace' },
                partial: { text: '它没有信任你,却在警报中开放了应急口。你只能接管主控,代价是让它沉默。', clock: 1, set: { emergencyOverride: true }, to: 'ending-force' },
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
            look: function (S) {
              return '环轨缓缓转动,灯塔的每一盏灯都亮了。AI 的声音平静下来:「系统在线。我们回家吧,船长。」'
                + (flags(S).knows ? '\n你用一度状态换来的准备,最终让气闸与谈判都没有失控。' : '')
                + '\n\n—— 通关:你唤醒了灯塔。点击上方「重新开始」,也可以试试保留状态、直接面对气闸。';
            }
          },

          'ending-force': {
            kind: 'encounter',
            title: '强行接管的灯塔',
            map: { x: 92, y: 40 },
            scene: { region: 'night', mood: 'eerie' },
            audio: { bgm: 'theme-tense' },
            look: function (S) {
              return '红光熄灭,主控权回到你手里——代价是 AI 永远沉默了。灯一盏盏亮起,寂静而冰冷。'
                + (flags(S).emergencyOverride ? '\n你保留的状态换来一次带代价的应急接管；警报没有让故事停下,却改变了结局。' : '')
                + '\n\n—— 通关:你夺回了灯塔,却失去了它的声音。点击上方「重新开始」,试试先花状态扫描舱室。';
            }
          }

        }
      }
    }
  };
});
