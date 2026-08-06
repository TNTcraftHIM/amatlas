/* ══════════════════════════════════════════════════════════════════════
   Amatlas maze3d 统一示例世界 —— 同一 maze3d runtime 的 recipes/layers。

   本目录是对外唯一 maze3d 可玩示例入口:basic / horror / puzzle / layers / fps-range 都是
   同一个 kind='maze3d'、同一份 raycast-maze.js 的教学切片,不是五个模块;
   同目录 gallery.html / audio-gallery.html 是素材试听辅助页,不是新 runtime。
   模块边界看 modules/* 与 manifest.modules;这里的 recipes 只教作者怎么组合。

   ⚠️ AI 作者做自己的迷宫时,从 basic_maze 这一个节点照抄骨架即可;
      hub 节点只是教学入口,自己的游戏不需要它。

   结构:
   · hub scene:解释入口与五个 recipe。
   · basic:最小闭环 + 压力板 set 开路。
   · horror:钥匙 K + 怪物 billboard + 被抓/逃出双结局。
   · puzzle:分支仪式库(三条可换序线索支路 + partial pages + optional warp + sequence 汇合 + 唯一 D)。
   · layers:多个 maze3d 节点 + scene/encounter 衔接 + 跨层 flag 门控。
   · fps-range:v3 私有 combat 数据 + session-local 多武器 pickup + 单 guard 生存闭环。

   设计原因:examples/demos 同时给人和 AI 看。把五种范本放进同一入口,能降低
   “horror-maze 是另一个模块”这类误读,同时保留每个 recipe 可复制的最小闭环。
══════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.MAZE3D_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function resetBasic(S) { S.basicEscaped = false; }
  function resetHorror(S) { S.horrorEscaped = false; S.horrorCaught = false; }
  function resetPuzzle(S) { S.puzzleEscaped = false; S.puzzleHasGem = false; S.puzzleHasFloorRelic = false; S.puzzleHasWallNote = false; S.puzzleSolvedRuneLock = false; }
  function resetLayers(S) { S.layerHasKey = false; S.layerReachedControls = false; S.layerMechSolved = false; S.layerEscaped = false; }
  function resetFpsRange(S) { S.fpsRangeEscaped = false; S.fpsRangeDeath = false; }

  function addPhotoOnce(state) {
  state.flags = state.flags || {};
  if (!state.flags.foundPhoto) { state.flags.foundPhoto = true; (state.inventory || (state.inventory = [])).push('photo'); }
}

  function backToHub(label) { return { to: 'hub', label: label || '回到 maze3d 入口' }; }

  return {
    id: 'd2fe3392-31e4-4016-a10d-517fff35b57e',
    start: { map: 'm', node: 'hub' },
    seed: 20260629,
    initState: {
      basicEscaped: false,
      horrorEscaped: false,
      horrorCaught: false,
      puzzleEscaped: false,
      puzzleHasGem: false,
      puzzleHasFloorRelic: false,
      puzzleHasWallNote: false,
      puzzleSolvedRuneLock: false,
      layerHasKey: false,
      layerReachedControls: false,
      layerMechSolved: false,
      layerEscaped: false,
      fpsRangeEscaped: false,
      fpsRangeDeath: false,
      inventory: []
    },
    items: {
      photo: { label: '半张血照片', description: '照片上是你自己,就站在那扇门前笑着——可你从没来过这里。',
        icon: [ { shape: 'rect', x: -10, y: -8, w: 20, h: 16, fill: '#d6d0c0', stroke: '#7c766a', sw: 1.5 },
                { shape: 'rect', x: -7, y: -5, w: 14, h: 10, fill: '#8c8678' },
                { shape: 'circle', cx: 3, cy: 4, r: 3.2, fill: '#961a14' } ] },
      'rune-note': { label: '符文残纸', icon: '📜', description: '残纸记录的点亮顺序是：月 → 火 → 星。' }
    },
    maps: {
      m: {
        name: 'maze3d recipes',
        nodes: {
          hub: {
            kind: 'scene',
            title: 'Amatlas maze3d',
            look: '这是 maze3d 的统一入口。下面五个入口不是五个模块,而是同一份 raycast-maze.js / 同一个 kind=\'maze3d\' 的五种 recipes。\n\n给人看:从这里选择基础、恐怖、机关、多层组合或 FPS 最小生存场范本。\n给 AI 看:照抄时先记住模块只有一个 maze3d;差异来自 world 数据、maze.events、monsters、私有 combat、scene/encounter 衔接和 manifest.modules。\n\n想看素材或声音,可在同目录 gallery.html / audio-gallery.html 单独打开。',
            scene: { region: 'ruins', mood: 'dawn' },
            audio: { music: { preset: 'calm', key: 'D', mode: 'minor', tempo: 72, instruments: ['pad', 'lead'], melody: 'sparse', seed: 20260629 }, ambient: 'cave' },
            links: [
              { to: 'puzzle_maze', label: 'Recipe 3 · 分支仪式库:三线索、可选捷径、符文锁', run: resetPuzzle },
              { to: 'fps_range', label: 'Recipe 5 · 直接玩 FPS:补给、反击、存活', run: resetFpsRange },
              { to: 'basic_maze', label: 'Recipe 1 · 基础迷宫:移动、压力板、出口门', run: resetBasic },
              { to: 'horror_entrance', label: 'Recipe 2 · 地底回廊:安静探路、触石唤醒、持钥回程', run: resetHorror },
              { to: 'layers_entrance', label: 'Recipe 4 · 多层迷宫:scene + encounter + 多个 maze3d', run: resetLayers }
            ]
          },

          // ── Recipe 1:基础闭环 + 改格 set ───────────────────────────────
          basic_maze: {
            kind: 'maze3d',
            title: 'Recipe 1 · 基础迷宫',
            winKey: 'basicEscaped',
            look: '最小 maze3d 闭环:一个实时第一人称迷宫节点 + 一个出口门 D + 出口后回到 scene。\n\n进迷宫后先别走,直接按 E / Enter 或点“查看”,可以读到一条只读纸条线索;再踩松动石板,前方封路的墙会沉下。用它理解 examine 与 maze.events.set 的区别。',
            wonText: '石墙尽头的光涌进来。你已经看完基础闭环:移动、转身、触发机关、走到 D 门、写 winKey。',
            maze: {
              grid: [
                '#########',
                '#....#.D#',
                '#.#.#.###',
                '#.......#',
                '#########'
              ],
              start: { x: 1, y: 1, dir: 'E' },
              theme: 'dungeon',
              wallDecorDensity: 0.16,
              maxWallDecor: 5,
              events: [
                { x: 3, y: 1, once: true, visual: 'plate', hint: 'Recipe 1 / set:你踩上一块松动的石板——前方一道石墙隆隆沉入地面。', set: [{ x: 5, y: 1, ch: '.' }] },
                { x: 2, y: 1, visual: 'pickup', icon: 'note', examine: '纸条上写着一句提醒:前面那块松动石板会打开封路的墙。' },
                { x: 4, y: 3, once: true, visual: 'pickup', icon: 'scroll', hint: '探索死路奖励:一卷前人留下的迷宫草图。它不改变通关,只教“可见拾取物”怎么摆。' }
              ]
            },
            links: [
              { to: 'basic_done', label: '走出基础迷宫', requires: function (s) { return !!s.basicEscaped; }, showWhenLocked: true, lockHint: '先踩压力板开路,再走到出口门 D' },
              backToHub('回到入口,稍后再看基础迷宫')
            ]
          },
          basic_done: {
            kind: 'scene',
            title: '基础 recipe 结束',
            look: '基础 recipe 的重点不是地牢题材,而是最小数据结构:kind=maze3d、maze.grid、maze.start、events.set、winKey、links.requires。\n\nAI 作者要做自己的迷宫时,先从这个骨架开始,再按需要加怪物、隐藏物或多层衔接。',
            scene: { region: 'forest', mood: 'dawn' },
            audio: { bgm: 'theme-calm' },
            links: [backToHub()]
          },

          // ── Recipe 2:恐怖追逐 + 临时钥匙 ───────────────────────────────
          horror_entrance: {
            kind: 'scene',
            title: 'Recipe 2 · 地底回廊',
            look: '先在安静的地底回廊辨认锁门与路线。触碰深处石座会放出骨钥匙,也会唤醒唯一的伪人;拿上钥匙,沿刚走过的路回到出口。',
            scene: { region: 'cave', mood: 'dread' },
            audio: { bgm: 'ambient-unease' },
            links: [{ to: 'horror_maze', label: '屏住呼吸,进入恐怖 recipe' }, backToHub('还是先回入口')]
          },
          horror_maze: {
            kind: 'maze3d',
            title: 'Recipe 2 · 地底回廊',
            winKey: 'horrorEscaped',
            scareKey: 'horrorCaught',
            scareSfx: 'horror-screech',
            // dread 垫层:复用恐怖 example(horror-demo)那条 ambient-unease 不安嗡鸣——探索时经 scareAmbient 叠 present-audio 恐怖 BGS,垫在 hbCtx 心跳底下(drone 持续低床 + 心跳脉冲穿透=经典恐怖分层,不抢频)。被抓仍自动静默(让 screech 突出)。见 docs/maze-audio-design.md §11。
            scareAmbient: 'ambient-unease',
            look: '先在安静中认路、预访锁门并查看血照片。触碰石座会放出骨钥匙并唤醒伪人;下一刻拿到钥匙后,沿熟悉路线回门。',
            wonText: '你带着骨钥匙撞开门。拖曳声在门后停住,回廊终于安静下来。',
            caughtText: '回程的拖曳声突然贴近。一张几乎是人的脸从黑暗里压了上来。',
            maze: {
              grid: [
                '###########',
                '#.........#',
                '#.#.#####.#',
                '#.#.....#.#',
                '#.#.###.#.#',
                '#.#.#...#.#',
                '#.#.#.#.#.#',
                '#.#...#.#.#',
                '#.#####.#.#',
                '#.#.....#D#',
                '###########'
              ],
              start: { x: 1, y: 1, dir: 'E' },
              theme: 'cave',
              wallDecorDensity: 0.14,
              maxWallDecor: 10,
              keyIcon: 'bone_key',
              monsters: [{ x: 5, y: 5, face: 'mimic', active: false }],
              chaseSpeed: 1.5,
              events: [
                { x: 5, y: 3, once: true, visual: 'pickup', icon: 'photo', hint: '脚下踩到半张照片,浸透了血。', run: addPhotoOnce },
                { x: 1, y: 9, once: true, visual: 'marker', hint: '石座裂开,骨钥匙浮出。内环深处响起拖曳声——拿上钥匙,回到你见过的那扇门。', set: [{ x: 1, y: 9, ch: 'K' }], activateMonsters: [0] }
              ]
            },
            links: [
              { to: 'horror_escaped', requires: function (s) { return !!s.horrorEscaped; }, showWhenLocked: true, lockHint: '你还没拿到钥匙、推开那扇门', label: '推开门,逃出去' },
              { to: 'horror_taken', requires: function (s) { return !!s.horrorCaught; }, showWhenLocked: true, lockHint: '——', label: '……(你被它抓住了)' },
              { to: 'horror_fled', requires: function (s) { return !s.horrorCaught && !s.horrorEscaped; }, label: '放弃,原路退回' }
            ]
          },
          horror_escaped: {
            kind: 'scene',
            title: '恐怖 recipe · 逃出',
            look: function (state) { return '你瘫坐在出口外,终于听不见回廊里的拖曳声。' + (state.flags && state.flags.foundPhoto ? '\n\n那半张血照片仍在你手里。' : ''); },
            scene: { region: 'forest', mood: 'dawn' },
            audio: { bgm: 'theme-calm' },
            links: [backToHub()]
          },
          horror_taken: {
            kind: 'scene',
            title: '恐怖 recipe · 被抓',
            look: '黑暗吞掉了回程。被抓事实来自同一只在石座事件后苏醒的伪人。',
            scene: { region: 'night', mood: 'horror-climax', elements: [{ kind: 'letterbox' }, { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' }], transition: 'slam' },
            audio: { bgm: false },
            links: [backToHub()]
          },
          horror_fled: {
            kind: 'scene',
            title: '恐怖 recipe · 放弃',
            look: '你在终局前主动退回石阶。回廊的环境声和追逐音乐都在这里停止。',
            scene: { region: 'cave', mood: 'eerie' },
            audio: { ambient: false, music: false },
            links: [backToHub()]
          },

          // ── Recipe 3:分支仪式库 ─────────────────────────────────────
          puzzle_maze: {
            kind: 'maze3d',
            title: 'Recipe 3 · 分支仪式库',
            winKey: 'puzzleEscaped',
            look: '先踩压力板打开中央分支,再以任意顺序找齐宝石、地砖遗物与墙上残纸。三条支路汇回中央的三槽符文锁;残纸会收入背包,可随时重读符号的点亮顺序。\n\n地砖支路有一条可选 warp 捷径,但普通路线同样可达。符文锁会逐项回执 0/3、1/3、2/3;三项齐全后才开放可重试的 sequence。答错不会消耗线索或改变通道。',
            wonText: '最后一道闸门打开。三条线索支路在中央符文锁汇合,前方唯一的门通向仪式库外。',
            maze: {
              grid: [
                '###############',
                '#...#.........#',
                '#####.###.###.#',
                '#...#...#.....#',
                '#.#####.#.###.#',
                '#.............#',
                '#.###.#.#####.#',
                '#...#.........#',
                '###############',
                '#######D#######',
                '###############'
              ],
              start: { x: 1, y: 1, dir: 'E' },
              theme: 'dungeon',
              wallTex: 'stone',
              floorTex: 'slab',
              ceilTex: 'rib',
              decorDensity: 0.015,
              maxDecor: 2,
              wallDecorDensity: 0.025,
              maxWallDecor: 2,
              decor: [{ x: 7, y: 3, icon: 'ritual_marks', scale: 1.15 }],
              wallDecor: [{ x: 8, y: 4, face: 'W', kind: 'sigil', u: 0.5, v: 0.30, scale: 1.2 }],
              exitStyle: 'portcullis',
              pillarStyle: 'ruined',
              pillars: [
                { x: 6, y: 5, style: 'ruined', scale: 1.35 },
                { x: 8, y: 5, style: 'ruined', scale: 1.35 },
                { x: 11, y: 1, style: 'crystal', scale: 1.20 },
                { x: 11, y: 7, style: 'obelisk', scale: 1.30 }
              ],
              events: [
                { x: 3, y: 1, once: true, visual: 'plate', hint: '压力板让通往中央仪式厅的石墙沉下。', set: [{ x: 4, y: 1, ch: '.' }] },
                { x: 5, y: 3, visual: 'marker', hint: '符文捷径把你送到地砖支路入口。', warp: { x: 1, y: 7, dir: 'E' } },
                { x: 2, y: 7, visual: 'trap', hint: '旋转地砖把你转向西侧。', turn: 'W' },
                { x: 3, y: 7, once: true, visual: 'floor-pickup', icon: 'ritual_marks', hint: '你拓下地砖遗物。', run: function (S) { S.puzzleHasFloorRelic = true; } },
                { x: 13, y: 1, once: true, visual: 'pickup', icon: 'gem', hint: '你取下宝石。', run: function (S) { S.puzzleHasGem = true; } },
                { x: 13, y: 7, once: true, visual: 'wall-pickup', face: 'S', icon: 'scroll', hint: '你从南墙抽出符文残纸,已收入背包。', run: function (S) { S.puzzleHasWallNote = true; var inventory = S.inventory || (S.inventory = []); if (inventory.indexOf('rune-note') < 0) inventory.push('rune-note'); } },
                { x: 7, y: 5, visual: 'plate', pages: [
                  { hint: '三处凹槽仍暗着:0/3。' },
                  { when: function (S) { return Number(!!S.puzzleHasGem) + Number(!!S.puzzleHasFloorRelic) + Number(!!S.puzzleHasWallNote) === 1 && !S.puzzleSolvedRuneLock; }, hint: '一处凹槽亮起:1/3。' },
                  { when: function (S) { return Number(!!S.puzzleHasGem) + Number(!!S.puzzleHasFloorRelic) + Number(!!S.puzzleHasWallNote) === 2 && !S.puzzleSolvedRuneLock; }, hint: '两处凹槽亮起:2/3。' },
                  { when: function (S) { return !!(S.puzzleHasGem && S.puzzleHasFloorRelic && S.puzzleHasWallNote && !S.puzzleSolvedRuneLock); }, examine: '三处凹槽齐亮,符文锁等待点亮顺序。', puzzle: { kind: 'sequence', prompt: '按背包中符文残纸记录的顺序点亮符号。', choices: ['月', '星', '火'], answer: ['月', '火', '星'] }, success: { hint: '三枚符号依次亮起,最后通道打开。', run: function (S) { S.puzzleSolvedRuneLock = true; }, set: [{ x: 7, y: 8, ch: '.' }] }, fail: { hint: '符号熄灭。顺序不对,请重读背包里的符文残纸。' } },
                  { when: function (S) { return !!S.puzzleSolvedRuneLock; }, examine: '符文锁已经熄灭,最后通道保持开启。' }
                ] },
                { x: 7, y: 7, visual: 'none', when: function (S) { return !!S.puzzleSolvedRuneLock; }, set: [{ x: 7, y: 8, ch: '.' }] }
              ]
            },
            links: [
              { to: 'puzzle_done', label: '走出分支仪式库', requires: function (s) { return !!s.puzzleEscaped; }, showWhenLocked: true, lockHint: '你还没推开尽头的门' },
              backToHub('回到入口,稍后再看分支仪式库')
            ]
          },
          puzzle_done: {
            kind: 'scene',
            title: '分支仪式库 · 完成',
            look: '三条支路汇回中央符文锁。你可以换一个线索顺序再来:先看见锁,自由找齐三线索,回到中枢解谜,最后由唯一出口收口。',
            scene: { region: 'forest', mood: 'dawn' },
            audio: { bgm: 'theme-calm' },
            links: [backToHub()]
          },

          // ── Recipe 4:多层组合 ───────────────────────────────────────
          layers_entrance: {
            kind: 'scene',
            title: 'Recipe 4 · 失落矿井',
            look: '多层 recipe 演示:一个游戏里可以有多个 maze3d 节点,中间用 scene / encounter 衔接。\n\n第一层通关写 layerHasKey,第二层通关写 layerReachedControls,控制室 scene 写 layerMechSolved,第三层通关写 layerEscaped。它仍然只注册一个 maze3d 模块实例。',
            scene: { region: 'cave', mood: 'dread' },
            audio: { bgm: 'ambient-unease' },
            links: [{ to: 'layers_scout', label: '走到矿道口,开始多层 recipe' }, backToHub('先回入口')]
          },
          layers_scout: {
            kind: 'encounter',
            title: '多层 recipe · 矿道口侦察',
            look: '下井之前,你贴着冰冷的井壁听了听。这个 encounter 不是 maze3d 的一部分,而是层间衔接:同一个游戏可以混合 scene / encounter / maze3d。',
            scene: { region: 'cave', mood: 'dread' },
            checks: [{
              id: 'scout', label: '侦察矿道',
              skill: '感知', dc: 7, dice: '2d6',
              cost: { res: '理智', amount: 1 },
              success: { text: '你听出了矿道的节奏,心里有了底。', to: 'layers_maze1' },
              fail: { text: '太安静了,反而什么都听不出。只能硬着头皮摸黑下去。', to: 'layers_maze1' }
            }],
            exits: [{ to: 'layers_maze1', label: '不侦察,直接拧亮头灯下去' }, backToHub('回入口')]
          },
          layers_maze1: {
            kind: 'maze3d', title: '多层 recipe · 第一层矿道',
            winKey: 'layerHasKey',
            look: '第一层是一座拔高的 cave 大型柱厅——石柱撑起高顶,空间比普通迷宫高敞得多(maze.wallScale 整场景等比拔高=大厅感;其余各层保持普通高度,对照「有些正常、有些大型」)。通关后写 layerHasKey,用来打开下一道 scene 闸门。',
            wonText: '门后是一间塌了半边的小室。一具矿工尸骨,手里死死攥着一把黄铜钥匙。你拿走了它。',
            maze: {
              // wallScale:整场景墙等比拔高=大厅/高墙感(R1 续·端用户「有些场景要大型天花板」)。开阔石室+柱子+拔高=大型柱厅;全场统一高度→无逐格阶梯。别的层不写=普通高度。
              // wallTexMode(可选,默认 'tile'):高墙的墙纹+装饰怎么放。'tile'=砖块自然大小·随墙拔高多贴几排(写实,默认);'stretch'=整面纹路随墙等比放大(宏伟/夸张)。此处不写=tile。
              grid: ['#######', '#.....#', '#.....#', '#.....#', '#....D#', '#######'],
              start: { x: 1, y: 1, dir: 'E' }, theme: 'ice', wallTex: 'ice', floorTex: 'crack', ceilTex: 'slab', wallScale: 1.85,
              decorDensity: 0.08, maxDecor: 5, wallDecorDensity: 0.06, maxWallDecor: 3,
              decor: [{ x: 2, y: 1, icon: 'ice_chips', scale: 1.18 }],
              wallDecor: [{ x: 3, y: 0, face: 'S', kind: 'crack', u: 0.5, v: 0.28, scale: 1.05 }],
              exitStyle: 'stairs', pillarStyle: 'stone',
              pillars: [{ x: 4, y: 1 }, { x: 2, y: 3 }]
            },
            links: [
              { to: 'layers_keydoor', requires: function (s) { return !!s.layerHasKey; }, showWhenLocked: true, lockHint: '你还没走出第一层', label: '带着钥匙,走向深处的铁门' },
              { to: 'layers_giveup', requires: function (s) { return !s.layerHasKey; }, label: '放弃,原路爬回升降梯' }
            ]
          },
          layers_keydoor: {
            kind: 'scene', title: '多层 recipe · 上锁闸门',
            look: '一道锈死的铁闸门挡住去路。它不是迷宫内的 D 门,而是普通 scene 节点里的 links.requires 门控。',
            scene: { region: 'metal', mood: 'eerie' },
            links: [
              { to: 'layers_maze2', requires: function (s) { return !!s.layerHasKey; }, showWhenLocked: true, lockHint: '门锁着,你需要钥匙', label: '把钥匙插进锁孔,进入第二层' },
              { to: 'layers_giveup', label: '退回升降梯' }
            ]
          },
          layers_maze2: {
            kind: 'maze3d', title: '多层 recipe · 第二层地牢',
            winKey: 'layerReachedControls',
            look: '第二层换成 dungeon 主题。通关后不是直接结束,而是进入控制室 scene。',
            wonText: '你撞开门,跌进一间布满齿轮的控制室。墙上,一道巨大的拉杆停在半途。',
            maze: {
              grid: ['#########', '#.......#', '#.#####.#', '#.#...#.#', '#.#.#.#.#', '#...#..D#', '#########'],
              start: { x: 1, y: 1, dir: 'E' }, theme: 'dungeon', wallDecorDensity: 0.16, maxWallDecor: 6
            },
            links: [
              { to: 'layers_mechanism', requires: function (s) { return !!s.layerReachedControls; }, showWhenLocked: true, lockHint: '出口还在更深处', label: '走进控制室' },
              { to: 'layers_giveup', requires: function (s) { return !s.layerReachedControls; }, label: '放弃' }
            ]
          },
          layers_mechanism: {
            kind: 'scene', title: '多层 recipe · 控制室符文机关',
            look: '通往最底层的石门刻满符文。这里用普通 scene 的 once/run 写 layerMechSolved,再用 requires 放行到第三个 maze3d 节点。',
            scene: { region: 'ruins', mood: 'dread' },
            links: [
              { to: 'layers_mechanism', once: true, run: function (s) { s.layerMechSolved = true; return '你按顺序转动三枚符文——咔哒、咔哒、咔哒。拉杆松动了。'; }, label: '按顺序转动三枚符文' },
              { to: 'layers_maze3', requires: function (s) { return !!s.layerMechSolved; }, showWhenLocked: true, lockHint: '机关还没解开,石门纹丝不动', label: '扳下拉杆,下到最底层' },
              { to: 'layers_giveup', label: '放弃' }
            ]
          },
          layers_maze3: {
            kind: 'maze3d', title: '多层 recipe · 深渊矿底',
            winKey: 'layerEscaped',
            look: '第三层换成 flesh 主题。这个 recipe 的重点是:同一个 maze3d runtime 可以在一个 world 里被多个节点重复使用。',
            wonText: '你冲过最后一道门,扑进升降梯,死命拉下闸杆。井壁飞速向上。你活着出来了。',
            maze: {
              grid: ['###########', '#.........#', '#.#######.#', '#.#.....#.#', '#.#.###.#.#', '#.#.#...#.#', '#.#.#.#.#.#', '#.#...#.#.#', '#.#####.#.#', '#.......#D#', '###########'],
              start: { x: 1, y: 1, dir: 'E' }, theme: 'flesh', wallTex: 'flesh', floorTex: 'crack', ceilTex: 'rib',
              decorDensity: 0.10, maxDecor: 6, wallDecorDensity: 0.16, maxWallDecor: 7,
              decor: [{ x: 2, y: 1, icon: 'flesh_nodule', scale: 1.1 }],
              wallDecor: [
                { x: 2, y: 0, face: 'S', kind: 'veins', u: 0.35, v: 0.22, scale: 1.1 },
                { x: 4, y: 0, face: 'S', kind: 'tentacle', u: 0.62, v: 0.25, scale: 1.0 },
                { x: 7, y: 0, face: 'S', kind: 'growth', u: 0.48, v: 0.32, scale: 1.2 },
                { x: 3, y: 0, face: 'S', kind: 'teeth', u: 0.5, v: 0.26, scale: 1.12 }
              ],
              exitStyle: 'sphincter'
            },
            links: [
              { to: 'layers_win', requires: function (s) { return !!s.layerEscaped; }, showWhenLocked: true, lockHint: '出口就在前面', label: '冲出最后一道门' },
              { to: 'layers_giveup', requires: function (s) { return !s.layerEscaped; }, label: '放弃' }
            ]
          },
          layers_win: {
            kind: 'scene', title: '多层 recipe 结束',
            look: '升降梯把你抬回地面。\n\n这个 recipe 证明:一个外部 maze3d 入口里可以有多个 maze3d 节点,并用 scene / encounter / flags 把它们串成完整关卡。',
            scene: { region: 'forest', mood: 'dawn' }, audio: { bgm: 'theme-calm' }, links: [backToHub()]
          },
          layers_giveup: {
            kind: 'scene', title: '多层 recipe · 退回地面',
            look: '你顺着来路爬回升降梯,头也不回。\n\n多层 recipe 也保留 escape hatch,因为教学范本不该把玩家或作者锁死。',
            scene: { region: 'cave', mood: 'eerie' }, links: [backToHub()]
          },

          // ── Recipe 5:FPS Phase 2a session-local 补给生存场 ────────────
          fps_range: {
            kind: 'maze3d',
            title: 'Recipe 5 · FPS 最小生存场',
            winKey: 'fpsRangeEscaped',
            look: '装甲目标封锁着走廊。你初始携带精确手枪，但主轴上的近程霰弹枪加两发刻针最多只能造成 80 伤害，不足以击穿 100 HP 装甲。先绕到北侧支路取得 +3 精确弹药，再回主轴拾取霰弹枪并自动装备；近距散射后按 1 切回精确手枪收尾，最后穿过发光 D。若先耗尽主轴资源，仍可在同一轮返回北侧恢复。南侧 +20 health 只在受伤后消费。首次移动、转向、开火或点击画面才会让追逐与攻击计时开始；初始画面可以安全阅读。首次点击画面只开始追逐并锁定鼠标，不会开枪。有效射击、空仓、切换和获得武器各有工业短音；全局回稳期间重复按下不会耗弹或缓冲。',
            wonText: '生存场出口打开。你完成了北侧弹药绕行、主轴近程散射、精确收尾并穿过既有 D 出口的完整资源闭环。',
            maze: {
              grid: [
                '#############',
                '#...........#',
                '#...........#',
                '#..........D#',
                '#...........#',
                '#...........#',
                '#############'
              ],
              start: { x: 1, y: 3, dir: 'E' },
              theme: 'industrial',
              wallTex: 'panel',
              floorTex: 'panel',
              ceilTex: 'beam',
              decorDensity: 0.04,
              maxDecor: 4,
              wallDecorDensity: 0.08,
              maxWallDecor: 4,
              decor: [{ x: 4, y: 2, icon: 'rust_scraps', scale: 1.0 }],
              wallDecor: [{ x: 4, y: 0, face: 'S', kind: 'cables', u: 0.5, v: 0.24, scale: 1.05 }],
              exitStyle: 'blast-door',
              pillarStyle: 'metal',
              pillars: [{ x: 5, y: 1, style: 'metal', scale: 0.86 }],
              combat: {
                exitRequires: 'clear',
                deathKey: 'fpsRangeDeath',
                player: { maxHealth: 60, health: 60 },
                loadout: [{ kind: 'precision', ammo: 2, maxAmmo: 6 }],
                equipped: 'precision',
                guard: { x: 7, y: 3, hp: 100, hitRadius: 0.34,
                  ai: { sight: 0, hear: 8, attackRange: 1.35, moveSpeed: 1.1, damage: 20, windup: 0.55, cooldown: 0.75 } },
                pickups: [
                  { x: 2, y: 3, kind: 'weapon', weapon: 'scatter', ammo: 1, maxAmmo: 4 },
                  { x: 1, y: 1, kind: 'ammo', weapon: 'precision', amount: 3 },
                  { x: 1, y: 5, kind: 'health', amount: 20 }
                ]
              }
            },
            links: [
              { to: 'fps_range', label: '一键重试', requires: function (s) { return !!s.fpsRangeDeath; }, run: resetFpsRange },
              { to: 'fps_range_death', label: '查看阵亡结果', requires: function (s) { return !!s.fpsRangeDeath; } },
              { to: 'fps_range_done', label: '活着离开生存场', requires: function (s) { return !!s.fpsRangeEscaped; }, showWhenLocked: true, lockHint: '走到走廊尽头的出口门 D' },
              backToHub('结束本轮生存练习')
            ]
          },
          fps_range_done: {
            kind: 'scene',
            title: 'FPS Encounter Kit · 资源绕行完成',
            look: '你从北侧支路补足刻针弹药，在同一轮资源账本中击穿 100 HP 装甲并穿过出口。枪械、敌人 HP、玩家资源、补给消费态和 AI 计时都只存在于本轮 maze3d 会话；跨层只留下通关事实。',
            scene: { region: 'station', mood: 'calm' },
            links: [backToHub()]
          },
          fps_range_death: {
            kind: 'scene',
            title: 'FPS Encounter Kit · 资源断裂',
            look: '这一轮已经结束。死亡事实只写入一次；重试会清除 durable deathKey，重新建立 60 HP、精确手枪 2/6 发弹药、北侧精确弹药、主轴霰弹枪、南侧医疗包和完整 100 HP 守卫。',
            scene: { region: 'station', mood: 'eerie' },
            links: [
              { to: 'fps_range', label: '重试生存场', run: resetFpsRange },
              backToHub('返回 maze3d 入口')
            ]
          }
        }
      }
    }
  };
});
