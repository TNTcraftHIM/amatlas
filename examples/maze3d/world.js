/* ══════════════════════════════════════════════════════════════════════
   Amatlas maze3d 统一示例世界 —— 同一 maze3d runtime 的 recipes/layers。

   本目录是对外唯一 maze3d 可玩示例入口:basic / horror / puzzle / layers 都是
   同一个 kind='maze3d'、同一份 raycast-maze.js 的教学切片,不是四个模块;
   同目录 gallery.html / audio-gallery.html 是素材试听辅助页,不是新 runtime。
   模块边界看 modules/* 与 manifest.modules;这里的 recipes 只教作者怎么组合。

   ⚠️ AI 作者做自己的迷宫时,从 basic_maze 这一个节点照抄骨架即可;
      hub 节点只是教学入口,自己的游戏不需要它。

   结构:
   · hub scene:解释入口与四个 recipe。
   · basic:最小闭环 + 压力板 set 开路。
   · horror:钥匙 K + 怪物 billboard + 被抓/逃出双结局。
   · puzzle:机关游乐场(set / warp / turn / pickup / pages / puzzle)。
   · layers:多个 maze3d 节点 + scene/encounter 衔接 + 跨层 flag 门控。

   设计原因:examples/demos 同时给人和 AI 看。把四种范本放进同一入口,能降低
   “horror-maze 是另一个模块”这类误读,同时保留每个 recipe 可复制的最小闭环。
══════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.MAZE3D_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function resetBasic(S) { S.basicEscaped = false; }
  function resetHorror(S) { S.horrorEscaped = false; S.horrorCaught = false; }
  function resetPuzzle(S) { S.puzzleEscaped = false; S.puzzleHasGem = false; S.puzzleHasFloorRelic = false; S.puzzleHasWallNote = false; S.puzzleSolvedRuneLock = false; S.puzzleOpenedFinalDoor = false; }
  function resetLayers(S) { S.layerHasKey = false; S.layerReachedControls = false; S.layerMechSolved = false; S.layerEscaped = false; }

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
      puzzleOpenedFinalDoor: false,
      layerHasKey: false,
      layerReachedControls: false,
      layerMechSolved: false,
      layerEscaped: false,
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
            look: '这是 maze3d 的统一入口。下面四个入口不是四个模块,而是同一份 raycast-maze.js / 同一个 kind=\'maze3d\' 的四种 recipes。\n\n给人看:从这里选择基础、恐怖、机关或多层组合范本。\n给 AI 看:照抄时先记住模块只有一个 maze3d;差异来自 world 数据、maze.events、monsters、scene/encounter 衔接和 manifest.modules。\n\n想看素材或声音,可在同目录 gallery.html / audio-gallery.html 单独打开。',
            scene: { region: 'ruins', mood: 'dawn' },
            audio: { music: { preset: 'calm', key: 'D', mode: 'minor', tempo: 72, instruments: ['pad', 'lead'], melody: 'sparse', seed: 20260629 }, ambient: 'cave' },
            links: [
              { to: 'basic_maze', label: 'Recipe 1 · 基础迷宫:移动、压力板、出口门', run: resetBasic },
              { to: 'horror_entrance', label: 'Recipe 2 · 恐怖迷宫:钥匙、怪物、被抓/逃出', run: resetHorror },
              { to: 'puzzle_maze', label: 'Recipe 3 · 机关迷宫:set / warp / puzzle / pages', run: resetPuzzle },
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
            look: '恐怖 recipe 仍然是同一个 maze3d runtime:只是 world 数据多了 grid 字符 K、monsters、scareKey、scareSfx 和一些气氛文案。\n\n目标:先找到发光钥匙 K,再去发光门 D。门锁、钥匙和怪物追逐都在 maze3d 模块内部完成;逃出/被抓后再回到普通 scene 节点。',
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
            look: '找到【发光金钥匙】,再正对【发光门】走过去。心跳越快,说明它越近。\n\n这段演示:K 钥匙、D 锁门、monsters billboard、mimic 脸、被抓 scareKey、逃出 winKey。',
            wonText: '你撞开门,跌进门外的光里。身后的黑暗合拢了——这次它没追上来。',
            caughtText: '一张几乎是人的脸从黑暗里贴了上来——可那双眼睛是两个空洞的黑窟窿。然后,什么都没有了。',
            maze: {
              grid: [
                '###########',
                '#.........#',
                '#.#######.#',
                '#.#.....#.#',
                '#.#.###.#.#',
                '#.#.#...#.#',
                '#.#.#.#.#.#',
                '#.#...#.#.#',
                '#.#####.#.#',
                '#K......#D#',
                '###########'
              ],
              start: { x: 1, y: 1, dir: 'E' },
              theme: 'cave',
              wallDecorDensity: 0.14,
              maxWallDecor: 10,
              keyIcon: 'bone_key',
              monsters: [{ x: 5, y: 5, face: 'mimic' }],
              chaseSpeed: 1.5,
              events: [
                { x: 5, y: 1, once: true, visual: 'pickup', icon: 'photo', hint: '脚下踩到半张照片,浸透了血。', run: function (S) { if (!S.flags.foundPhoto) { S.flags.foundPhoto = true; (S.inventory || (S.inventory = [])).push('photo'); } } }
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
            look: function (s) { return '你瘫坐在出口外的草地上,胸口剧烈起伏。头顶是久违的天光。' + (s.flags && s.flags.foundPhoto ? '\n\n你摊开在回廊里捡到的那半张血照片——照片上是你自己,就站在这扇门前,笑着。' : '') + '\n\n这个 recipe 演示的是同一 maze3d 节点如何承载追逐、钥匙与双结局。'; },
            scene: { region: 'forest', mood: 'dawn' },
            audio: { bgm: 'theme-calm' },
            links: [backToHub()]
          },
          horror_taken: {
            kind: 'scene',
            title: '恐怖 recipe · 被抓',
            look: '黑暗。\n\n这条结局来自 maze3d 内部 scareKey,不是另一个模块。被抓瞬间的 sting 已在迷宫里响过,这里故意留死寂。',
            scene: { region: 'night', mood: 'horror-climax', elements: [{ kind: 'letterbox' }, { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' }], transition: 'slam' },
            audio: { bgm: false },
            links: [backToHub()]
          },
          horror_fled: {
            kind: 'scene',
            title: '恐怖 recipe · 放弃',
            look: '你顺着来路摸回石阶,头也不回地爬了出去。\n\n放弃出口是 recipe 的 escape hatch:让教学范本不把玩家困死。',
            scene: { region: 'cave', mood: 'eerie' },
            links: [backToHub()]
          },

          // ── Recipe 3:机关游乐场 ─────────────────────────────────────
          puzzle_maze: {
            kind: 'maze3d',
            title: 'Recipe 3 · 机关游乐场',
            winKey: 'puzzleEscaped',
            look: '一条蛇形主路依次演示 maze.events 的主要机关:改格 set、传送 warp、转向 turn、显眼拾取 pickup、地面隐藏 floor-pickup、墙面隐藏 wall-pickup、数据谜题 puzzle 与 pages 状态变体。\n\n找齐宝石、地砖符号和墙上残纸后,走上最后一段的符文锁。残纸会收入背包,可随时重读三个符号的点亮顺序;谜题沿用默认自动触发,不要求额外按“互动”。答错只给提示,可以立即重试。',
            wonText: '最后一道石门在你面前打开。你已经体验了 set / warp / turn / pickup / floor-pickup / wall-pickup / puzzle / pages。',
            maze: {
              grid: [
                '#############',
                '#....#......#',
                '###########.#',
                '#...........#',
                '#############',
                '#...........#',
                '###########.#',
                '#D......#...#'
              ],
              start: { x: 1, y: 1, dir: 'E' },
              theme: 'dungeon',
              exitStyle: 'archway',
              wallDecorDensity: 0.06,
              maxWallDecor: 3,
              pillarStyle: 'stone',
              pillars: [
                { x: 7, y: 1, style: 'stone', scale: 1.45 },
                { x: 9, y: 3, style: 'ruined', scale: 1.35 },
                { x: 3, y: 5, style: 'obelisk', scale: 1.30 },
                { x: 5, y: 7, style: 'crystal', scale: 1.20 },
                { x: 7, y: 7, style: 'metal', scale: 1.15 }
              ],
              events: [
                { x: 3, y: 1, once: true, visual: 'plate', hint: 'Recipe 3 / set:压力板让封死的石墙沉入地面。', set: [{ x: 5, y: 1, ch: '.' }] },
                { x: 1, y: 3, visual: 'marker', hint: 'Recipe 3 / warp:脚下符文骤然亮起,你被传送到隔空的另一段。', warp: { x: 1, y: 5, dir: 'E' } },
                { x: 6, y: 5, once: true, visual: 'trap', hint: 'Recipe 3 / turn:旋转地砖打乱朝向;用方向键转回去即可。', turn: 'W' },
                { x: 9, y: 5, once: true, visual: 'pickup', icon: 'gem', hint: 'Recipe 3 / pickup:你拾起一颗显眼宝石。', run: function (S) { S.puzzleHasGem = true; } },
                { x: 10, y: 5, once: true, visual: 'floor-pickup', icon: 'ritual_marks', hint: 'Recipe 3 / floor-pickup:你拓下地砖缝里的细小符号。旁边北墙似乎也藏着纸片。', run: function (S) { S.puzzleHasFloorRelic = true; } },
                { x: 10, y: 5, once: true, visual: 'wall-pickup', face: 'N', icon: 'scroll', hint: 'Recipe 3 / wall-pickup:你从北侧浅色纸片后抽出一页残纸,已收入背包,可随时重读。', run: function (S) { S.puzzleHasWallNote = true; var inventory = S.inventory || (S.inventory = []); if (inventory.indexOf('rune-note') < 0) inventory.push('rune-note'); } },
                { x: 9, y: 7, visual: 'plate', pages: [
                  { hint: 'Recipe 3 / pages:最后一道石板列出三处凹槽——宝石、地砖符号、残纸线索还没凑齐。' },
                  { when: function (S) { return !!(S.puzzleHasGem && S.puzzleHasFloorRelic && S.puzzleHasWallNote && !S.puzzleSolvedRuneLock); }, examine: '符文锁要求按残纸记录的顺序点亮三枚符号。', puzzle: { kind: 'sequence', prompt: '按背包中符文残纸记录的顺序点亮符号。', choices: ['月', '星', '火'], answer: ['月', '火', '星'] }, success: { hint: 'Recipe 3 / puzzle:三枚符号依次亮起,最后一道封门滑开。', run: function (S) { S.puzzleSolvedRuneLock = true; S.puzzleOpenedFinalDoor = true; }, set: [{ x: 8, y: 7, ch: '.' }] }, fail: { hint: '符号同时熄灭。顺序不对,请重读背包里的符文残纸。' } },
                  { when: function (S) { return !!S.puzzleSolvedRuneLock; }, examine: '符文锁已经熄灭,敞开的门洞通向出口。' }
                ] }
              ]
            },
            links: [
              { to: 'puzzle_done', label: '走出机关游乐场', requires: function (s) { return !!s.puzzleEscaped; }, showWhenLocked: true, lockHint: '你还没闯到尽头的门' },
              backToHub('回到入口,稍后再看机关 recipe')
            ]
          },
          puzzle_done: {
            kind: 'scene',
            title: '机关 recipe 结束',
            look: '机关 recipe 的核心是“走到某格,改变迷宫本身或状态”。这类能力适合做解谜,但仍属于 maze3d 数据层,不是新 module。',
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
              start: { x: 1, y: 1, dir: 'E' }, theme: 'cave', wallScale: 1.85, decorDensity: 0, wallDecorDensity: 0.12, maxWallDecor: 4,
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
              start: { x: 1, y: 1, dir: 'E' }, theme: 'flesh', decorDensity: 0.04, maxDecor: 10, wallDecorDensity: 0.22, maxWallDecor: 14,
              wallDecor: [
                { x: 2, y: 0, face: 'S', kind: 'veins', u: 0.35, v: 0.22, scale: 1.1 },
                { x: 4, y: 0, face: 'S', kind: 'tentacle', u: 0.62, v: 0.25, scale: 1.0 },
                { x: 7, y: 0, face: 'S', kind: 'growth', u: 0.48, v: 0.32, scale: 1.2 }
              ]
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
          }
        }
      }
    }
  };
});
