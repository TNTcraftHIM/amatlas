/* ════════════════════════════════════════════════════════════════════════
   Amatlas arcade demo 世界数据 —— 实时小游戏关卡(贪吃蛇)作为门禁。
   ════════════════════════════════════════════════════════════════════════
   小游戏 = 一等可组合内嵌玩法模块(与 text-adventure/tabletop 同一等机制):
   节点 kind='arcade' 由自定义 snake 模块认领(见 snake-module.js),经 manifest.modules
   平权注册(game.js),核心零改动。指引见 text-adventure-game skill 的 references/puzzles-and-minigames.md §B。

   ── 为什么这样写就能过三闸(零引擎改动)──────────────────────────────────
   · 通关:snake 模块在「赢」的离散边界一次 api.apply 置 state 键 snakeWon=true(顶层键,
     在 initState 声明 → graph-audit 死 state 键检查因「已声明」跳过、零误报;作者若拼错
     requires 的键名反而会被 P0 抓到 = 闸帮忙)。win-link 据此解锁,玩家点「推开门」进入 vault。
   · 认输:terminal 必带一条**无条件、to 别的节点、非 once** 的「放弃」出口 → graph-audit
     认作保底出口(无 soft-lock P0)、装配探针沿它走得出(探针玩不了 rAF,但能验证逃生口真实可走)。
   · 存档语义 LOUD:进关卡的 look 文案显式告知「本局蛇身/苹果位置不入档」(中途刷新=本局重开,街机语义);外层 snakeWon/snakeFails 仍随 Amatlas 存档保存。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.ARCADE_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    id: 'b56a1a4c-06cb-4937-9b20-42ee106ebaeb',
    start: { map: 'm', node: 'foyer' },
    initState: { snakeWon: false, snakeFails: 0 },   // ★ 声明 win/失败计数键:模块通关置 snakeWon、每局撞死 snakeFails+1;声明让 graph-audit 死 state 键检查跳过(零误报)
    maps: {
      m: {
        name: '废弃研究站',
        nodes: {

          foyer: {
            kind: 'scene',
            title: '门厅',
            look: '锈蚀的门厅。尽头一道封锁的合金门,旁边一台老终端还在幽幽闪烁。',
            links: [
              { to: 'terminal-intro', label: '走向闪烁的终端' },   // 先到待机屏(讲规则)而非直接起局——治"猝不及防"
              { to: 'leave',    label: '掉头离开研究站' }
            ]
          },

          // ── ready/待机屏(opt-in 引入,治"进入即自动起局"):讲清目标/操作/不存档,玩家主动点"开始"才进 arcade ──
          //    (WarioWare 单动词指令 + boss 预告 / Yakuza 按键进入显难度 / Ren'Py call screen 显式调用 / Skyrim 预览难度再激活)
          'terminal-intro': {
            kind: 'scene',
            title: '终端待机屏',
            look: '终端亮着一行待机字:「贪吃蛇 · 吃满 5 个苹果即解锁合金门」。\n操作:方向键 / WASD 或画布下方触屏按钮；撞墙或咬到自己就死，可按方向键或“重开本局”重来。'
                + '\n⚠ 蛇局里的蛇身/苹果位置不存档,中途离开或刷新会从本局开头重来;通关标记与失败次数会保存。随时能放弃离开、不会卡死。',
            links: [
              { to: 'terminal', label: '坐下,开始挑战' },   // 玩家主动 opt-in → 进 arcade 节点,snake 模块这时才起局
              { to: 'foyer',    label: '再想想,先离开' }     // 无条件 + to 别节点 + 非 once = 保底出口
            ]
          },

          terminal: {
            kind: 'arcade',                 // ← 由自定义 snake 模块认领(manifest.modules)
            title: '闪烁的终端',
            winKey: 'snakeWon',             // 自定义字段:snake 模块通关时置此 state 键(与下方 requires 读的键一致——作者自己的命名)
            failKey: 'snakeFails',          // 模块每局撞死在此键 +1(顶层 state 键、在 initState 声明=死键检查零误报)
            lockAfter: 3,                   // 撞死 3 次后这局"锁死"(模块不再起局),同时下方 fail-forward 强闯出口解锁(锁一扇门=开另一扇)
            goal: 5,                        // 吃满 5 个苹果即通关(模块读 node.goal)
            look: '贪吃蛇:吃满 5 个苹果开门。方向键 / WASD 或画布下方触屏按钮操作；撞死可按方向键或“重开本局”重来。',
            wonText: '终端闪过一行字:ACCESS GRANTED。合金门锁咔哒一声弹开。',
            lockedText: '终端过热、黑屏锁死了——硬玩是进不去了。但你盯着控制面板,起了别的心思……',
            links: [
              // 通关出口:gated;snake 模块置 snakeWon 后解锁。showWhenLocked=灰显「先通关」的 affordance。
              { to: 'vault', requires: function (S) { return S.snakeWon; }, label: '推开解锁的门', showWhenLocked: true, lockHint: '通关终端后开启' },
              // ★ fail-forward 降级出口:撞死够多次(锁死)后解锁——"锁住技巧门 = 同时开蛮力门",带代价(警报)但绝不卡死
              //    (Skyrim 撬棍/DXHR 冷却分级/NSMB Super Guide/Disco Elysium 失败=分叉;requires 读 initState 声明的 snakeFails)
              { to: 'vault', requires: function (S) { return (S.snakeFails || 0) >= 3; }, label: '撬开控制面板,硬闯进去(警报会响,但门开了)', showWhenLocked: true, lockHint: '多次失败后,你会想起暴力手段' },
              // ★ 认输出口:无条件、to 别的节点、非 once → 保底出口(任何时候都能走、永不卡死;WCAG 2.2.1 可跳过)
              { to: 'foyer', label: '放弃挑战,退回门厅' }
            ]
          },

          vault: {
            kind: 'scene',
            title: '核心机房',
            look: '门后是嗡嗡作响的核心机房。你取下数据核心——任务完成。'
            // 无出口 = 通关结局(graph-audit 报 P2 死胡同·良性·不阻断,同其它 demo 结局)
          },

          leave: {
            kind: 'scene',
            title: '研究站之外',
            look: '你转身走进风里,合金门后的谜团留在身后。也是一种结局。'
            // 无出口 = 放弃结局
          }

        }
      }
    }
  };
});
