/* ════════════════════════════════════════════════════════════════════════
   Amatlas origin · 综合 dogfood 世界数据(origin/world.js)
   ════════════════════════════════════════════════════════════════════════
   ⚠ 这是引擎综合验证沙盒(dogfood),不是起步模板。
   起步请复制 text-adventure-demo/ 或 tabletop-demo/ 目录。
   origin 综合演示 cutscene + scene + encounter + maze3d 的组合上限,
   并验证 atlas 引擎自身的功能边界;代码密度远超普通游戏所需。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.ORIGIN_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var CELESTIAL_RING_ART = [
    { shape: 'circle', cx: 0, cy: 0, r: 13, fill: 'rgba(7,11,20,.5)', stroke: '#c8a24a', sw: 0.9, op: 0.86 },
    { shape: 'circle', cx: 0, cy: 0, r: 9, fill: 'none', stroke: '#e6cd86', sw: 0.55, op: 0.72 },
    { shape: 'line', x1: -13, y1: 0, x2: 13, y2: 0, stroke: '#c8a24a', sw: 0.55, op: 0.58 },
    { shape: 'line', x1: 0, y1: -13, x2: 0, y2: 13, stroke: '#c8a24a', sw: 0.55, op: 0.58 },
    { shape: 'circle', cx: 0, cy: 0, r: 2.2, fill: '#e6cd86', stroke: '#f2e9cf', sw: 0.45 }
  ];

  var CONSTELLATION_ART = [
    { shape: 'line', x1: -12, y1: 7, x2: -5, y2: -6, stroke: '#c8a24a', sw: 0.8, op: 0.68 },
    { shape: 'line', x1: -5, y1: -6, x2: 3, y2: 1, stroke: '#c8a24a', sw: 0.8, op: 0.68 },
    { shape: 'line', x1: 3, y1: 1, x2: 11, y2: -8, stroke: '#c8a24a', sw: 0.8, op: 0.68 },
    { shape: 'circle', cx: -12, cy: 7, r: 1.7, fill: '#e6cd86' },
    { shape: 'circle', cx: -5, cy: -6, r: 1.25, fill: '#f2e9cf' },
    { shape: 'circle', cx: 3, cy: 1, r: 1.6, fill: '#e6cd86' },
    { shape: 'circle', cx: 11, cy: -8, r: 1.25, fill: '#f2e9cf' }
  ];

  return {
    id: '9c63be4f-6235-4141-93aa-f11ae6e41fd7',
    start: { map: 'atlas', node: 'fall' },
    seed: 20260713,
    initState: { insight: 0, worldShape: '', corridorLit: false },
    maps: {
      atlas: {
        name: '未竟星图',
        nodes: {
          fall: {
            kind: 'cutscene',
            title: '序章 · 天穹坠落',
            map: { x: 12, y: 86 },
            beats: [
              {
                dur: 2.8,
                text: '判词落下时，天也落了下来。',
                scene: {
                  region: 'night',
                  mood: 'calm',
                  transition: 'fade',
                  elements: [
                    { kind: 'item', ref: '残月', art: 'moon' },
                    { kind: 'item', ref: '天球仪', art: CELESTIAL_RING_ART },
                    { kind: 'character', ref: '泰坦', art: 'figure' }
                  ]
                },
                audio: { music: 'desolate', ambient: 'wind', sfx: ['impact'] }
              },
              {
                dur: 3.4,
                text: [
                  '诸神命你永世扛住天空。',
                  '群山从肩胛里长出，云层在脊背上结冰。'
                ],
                scene: {
                  region: 'skyclouds',
                  mood: 'storm',
                  elements: [
                    { kind: 'item', ref: '冻结的云冠', art: 'cloud' },
                    { kind: 'item', ref: '山脊', art: 'mountain' },
                    { kind: 'character', ref: '受罚者', art: 'figure' }
                  ]
                },
                audio: {
                  music: {
                    preset: 'tense',
                    tempo: 64,
                    rhythm: { bassPattern: 'pedal' },
                    timbre: { pad: 'organ', bass: 'sub' }
                  },
                  ambient: 'storm',
                  sfx: ['thunder']
                }
              },
              {
                dur: 3.8,
                text: '你跪进虚空，双手撑住星穹。可贴近之后，黑夜里浮出了细密的线。',
                scene: {
                  region: 'night',
                  mood: 'calm',
                  transition: 'fade',
                  elements: [
                    { kind: 'item', ref: '残月', art: 'moon' },
                    { kind: 'item', ref: '初现星线', art: CONSTELLATION_ART },
                    { kind: 'character', ref: '泰坦', art: 'figure' }
                  ]
                }
              },
              {
                hold: true,
                text: '那不是空洞的天。那是一册尚未画完的星图。',
                scene: {
                  region: 'night',
                  mood: 'calm',
                  transition: 'fade',
                  elements: [
                    { kind: 'item', ref: '残月', art: 'moon' },
                    { kind: 'item', ref: '未竟星图', art: CELESTIAL_RING_ART },
                    { kind: 'item', ref: '暗星', art: 'crystal' },
                    { kind: 'character', ref: '泰坦', art: 'figure' }
                  ]
                },
                run: function (S) { S.flags.condemned = true; }
              }
            ],
            links: [ { to: 'shoulder', label: '撑住天穹' } ]
          },

          shoulder: {
            kind: 'scene',
            name: '肩上的夜',
            map: { x: 25, y: 72 },
            scene: {
              region: 'skyclouds',
              mood: 'midnight',
              transition: 'fade',
              elements: [
                { kind: 'item', ref: '沉降云海', art: 'cloud' },
                { kind: 'item', ref: '天穹经纬', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '暗星', art: 'crystal' },
                { kind: 'character', ref: '阿特拉斯', art: 'figure' }
              ]
            },
            audio: {
              music: { preset: 'desolate', tempo: 46, timbre: { pad: 'choir' } },
              ambient: 'wind'
            },
            look: function (S, first) {
              return first
                ? '天穹压在你的肩上。近处的星并不发光，只留下位置、距离和彼此之间若有若无的连线。你忽然听见其中一颗暗星发出极轻的脉搏。'
                : '重量仍在，但你已经知道：黑暗并非空无。那颗暗星仍在等你的回答。';
            },
            links: [
              {
                to: 'listen',
                label: '不再对抗重量，先听那颗暗星',
                run: function (S) {
                  S.flags.listened = true;
                  S.insight = Math.max(S.insight, 1);
                }
              },
              {
                to: 'brace',
                label: '把双脚钉进虚空，先稳住天空',
                run: function (S) { S.flags.braced = true; }
              }
            ]
          },

          listen: {
            kind: 'scene',
            name: '星的脉搏',
            map: { x: 39, y: 61 },
            scene: {
              region: 'night',
              mood: 'holy',
              transition: 'fade',
              elements: [
                { kind: 'item', ref: '星脉刻度', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '脉搏连线', art: CONSTELLATION_ART },
                { kind: 'item', ref: '暗星', art: 'crystal' }
              ]
            },
            audio: {
              music: { preset: 'sacral', tempo: 50, timbre: { pad: 'choir', bass: 'organ' } },
              ambient: 'night',
              sfx: ['magic']
            },
            look: '肩上的星穹近得像一面墙，只有你和那颗暗星彼此倾听。疼痛退到远处，脉搏于是显出层次：一次是海的深度，一次是陆地的轮廓，再一次，像某个还没有名字的人在呼吸。重量第一次变得可以阅读。',
            links: [ { to: 'burden', label: '把天穹的重量拆成一组坐标' } ]
          },

          brace: {
            kind: 'scene',
            name: '泰坦的支点',
            map: { x: 39, y: 80 },
            scene: {
              region: 'ruins',
              mood: 'tense',
              transition: 'fade',
              elements: [
                { kind: 'item', ref: '远方山影', art: 'mountain' },
                { kind: 'item', ref: '受力星环', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '支点', art: 'rock' },
                { kind: 'character', ref: '阿特拉斯', art: 'figure' }
              ]
            },
            audio: {
              music: {
                preset: 'tense',
                tempo: 60,
                rhythm: { bassPattern: 'pedal' },
                timbre: { pad: 'organ', bass: 'organ' }
              },
              ambient: 'wind',
              sfx: ['impact']
            },
            look: '你没有屈膝。脚下本无大地，却被你的意志压出第一块支点。肩骨记住了天穹的弧度；只要再撑过一次最沉的震颤，你就能抬头看清它。',
            links: [ { to: 'burden', label: '迎向最沉的一次震颤' } ]
          },

          burden: {
            kind: 'encounter',
            title: '检定 · 世界的重量',
            map: { x: 53, y: 66 },
            scene: {
              region: 'skyclouds',
              mood: 'tense',
              elements: [
                { kind: 'item', ref: '压境云冠', art: 'cloud' },
                { kind: 'item', ref: '坠落的天穹', art: 'mountain' },
                { kind: 'item', ref: '承重点', art: CONSTELLATION_ART },
                { kind: 'character', ref: '承天者', art: 'figure' }
              ]
            },
            audio: {
              music: {
                preset: 'sacral',
                tempo: 56,
                intensity: 0.72,
                rhythm: { bassPattern: 'pedal' },
                timbre: { pad: 'organ', bass: 'organ' }
              },
              ambient: 'storm'
            },
            look: function (S) {
              return S.flags.listened
                ? '星图突然收紧。你已听出重量的节拍，可以在它落下前移动肩膀。'
                : '星图突然收紧。你脚下的支点发出裂响，但身体已经记住该向哪里发力。';
            },
            checks: [
              {
                id: 'carry_sky',
                label: '扛住这一次坠落',
                skill: '承受',
                dc: 8,
                dice: '2d6',
                cost: { res: '意志', amount: 0 },
                advantage: function (S) { return !!S.flags.listened; },
                bonus: function (S) { return S.flags.braced ? 1 : 0; },
                success: {
                  text: '你没有把天空推回去，而是顺着它的经纬托住了它。最暗的那颗星落到你掌心。',
                  flag: 'heldSteady',
                  to: 'steady'
                },
                crit: {
                  text: '你在重量落下前看见了全部支点。天穹安静了一瞬，群星像等待落笔的墨。',
                  flag: 'heldSteady',
                  set: { perfectHold: true },
                  to: 'steady'
                },
                fail: {
                  text: '膝盖撞进虚空，天穹压低了一尺。裂缝里却涌出成千上万颗未点亮的星。',
                  clock: 1,
                  set: { kneeDown: true },
                  to: 'fracture'
                },
                fumble: {
                  text: '支点粉碎，你和天空一同下坠。就在失重的一刻，你看见黑暗背后密密麻麻的世界种子。',
                  clock: 2,
                  set: { kneeDown: true, sawAbyss: true },
                  to: 'fracture'
                }
              }
            ],
            exits: [ { to: 'shoulder', label: '在掷骰前，重新审视判词' } ]
          },

          steady: {
            kind: 'scene',
            name: '掌心的暗星',
            map: { x: 68, y: 48 },
            scene: {
              region: 'night',
              mood: 'holy',
              transition: 'fade',
              elements: [
                { kind: 'item', ref: '星穹刻度', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '已连经纬', art: CONSTELLATION_ART },
                { kind: 'character', ref: '承天者', art: 'figure' },
                { kind: 'item', ref: '世界种子', art: 'crystal' }
              ]
            },
            audio: {
              music: { preset: 'sacral', tempo: 48, timbre: { pad: 'choir', bass: 'organ' } },
              ambient: 'night',
              sfx: ['success']
            },
            look: function (S) {
              return '星穹之下，你站稳了。掌心那颗暗星没有温度，却装着潮汐、岩层和风的空位。'
                + (S.flags.perfectHold ? ' 方才完美的一撑还让你看见：星与星之间的线，其实是一条条可行走的路。' : ' 你终于明白，重量不是惩罚本身；它是尚未被解释的数据。');
            },
            links: [
              {
                to: 'corridor_threshold',
                label: '带着世界种子踏进星图的夹层',
                run: function (S) { S.flags.seedFound = true; }
              }
            ]
          },

          fracture: {
            kind: 'scene',
            name: '裂隙之下',
            map: { x: 66, y: 75 },
            scene: {
              region: 'night',
              mood: 'abyssal',
              transition: 'slam',
              elements: [
                { kind: 'item', ref: '断裂星线', art: CONSTELLATION_ART },
                { kind: 'item', ref: '倾覆星环', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '裂隙', art: 'rock' },
                { kind: 'item', ref: '世界种子', art: 'crystal' }
              ]
            },
            audio: {
              music: { preset: 'eerie', tempo: 48, timbre: { pad: 'choir', arp: 'soft' } },
              ambient: 'ambient-unease',
              sfx: ['magic']
            },
            look: function (S) {
              return '你单膝跪着，肩头疼得发白。但裂隙替你掀开了星图的背面：无数暗星并不是死去，它们只是还没有收到足够的数据。'
                + (S.flags.sawAbyss ? ' 最深处还有更多微光回应你，像尚未开始的存档。' : ' 最近的一颗滚到你手边，安静地等待定义。');
            },
            links: [
              {
                to: 'corridor_threshold',
                label: '拾起世界种子，坠进裂隙后的回廊',
                run: function (S) { S.flags.seedFound = true; }
              }
            ]
          },

          corridor_threshold: {
            kind: 'scene',
            name: '未明回廊',
            map: { x: 75, y: 59 },
            scene: {
              region: 'night',
              mood: 'abyssal',
              transition: 'slam',
              elements: [
                { kind: 'item', ref: '冻结星线', art: CONSTELLATION_ART },
                { kind: 'item', ref: '星图断层', art: 'crystal' },
                { kind: 'item', ref: '回廊星门', art: CELESTIAL_RING_ART },
                { kind: 'character', ref: '承星者', art: 'figure' }
              ]
            },
            audio: {
              music: { preset: 'eerie', tempo: 52, timbre: { pad: 'choir', arp: 'soft' } },
              ambient: 'ambient-unease',
              sfx: ['magic']
            },
            look: function (S) {
              var arrival = S.flags.kneeDown
                ? '裂隙没有尽头。你抱住世界种子继续下坠，直到黑暗在脚下折成一条可以行走的回廊。'
                : '你刚踏上通往星图中心的连线，线便从脚下翻转。你和世界种子一同落进星图背面的夹层。';
              return arrival + '\n\n这里像一个尚未被画完的世界：墙是冻结的经纬，远处三枚星痕依次沉睡。只有亲自走过这些空白，星图才会承认你找到了中心。';
            },
            links: [
              { to: 'unlit_corridor', label: '托住世界种子，走进未明回廊' }
            ]
          },

          unlit_corridor: {
            kind: 'maze3d',
            title: '第一章 · 尚未点亮的世界',
            winKey: 'corridorLit',
            audio: {
              // 迷宫泛用化后按需点播 BGM:神圣晶体回廊要 sacral 铺底(非恐怖迷宫、无怪物心跳争频),而非默认静默。见 docs/maze-audio-design.md §11。
              // 四层配器(长时探索防单调):choir pad 圣咏 wash + organ bass 深沉根基 + harp arp 星辰微光 + bell lead 钟鸣点题(harp/bell=天体意象,贴"点亮星痕")。
              music: { preset: 'sacral', tempo: 48, instruments: ['pad', 'bass', 'arp', 'lead'], timbre: { pad: 'choir', bass: 'organ', arp: 'harp', lead: 'bell' }, intensity: 0.62 }
            },
            look: '第一人称穿过星图夹层。找到三枚悬浮星痕；每点亮一枚，冻结的经纬就会打开一段。第三枚会让中心之门显形。\n\n可用画面下方的方向按钮触屏移动，也可用方向键或 WASD。',
            wonText: '第三枚星痕把整条回廊连成一幅完整星图。中心之门在你面前展开，世界种子第一次发出温度。',
            maze: {
              grid: [
                '#############',
                '#.....#.....#',
                '#.###.#.###.#',
                '#.#...#...#.#',
                '#.#.#####.#.#',
                '#...#.....#.#',
                '###.#.###.#.#',
                '#.....#.....#',
                '#############'
              ],
              start: { x: 1, y: 1, dir: 'E' },
              theme: 'crystal',
              wallTex: 'crystal',
              floorTex: 'panel',
              ceilTex: 'beam',
              exitStyle: 'portal',
              wallScale: 1.25,
              wearLevel: 0.18,
              idleHint: '世界还没有名字。只有你的脚步在替它确认边界。',
              pillarStyle: 'crystal',
              pillars: [
                { x: 9, y: 1, style: 'crystal', scale: 0.9 },
                { x: 8, y: 7, style: 'crystal', scale: 1.05 }
              ],
              wallDecorDensity: 0.12,
              maxWallDecor: 7,
              decorDensity: 0.1,
              maxDecor: 8,
              wallDecor: [
                { x: 3, y: 0, face: 'S', kind: 'sigil', u: 0.5, v: 0.36, scale: 1.05 },
                { x: 7, y: 0, face: 'S', kind: 'crystals', u: 0.5, v: 0.5, scale: 0.9 },
                { x: 12, y: 3, face: 'W', kind: 'sigil', u: 0.48, v: 0.34, scale: 0.9 },
                { x: 0, y: 7, face: 'E', kind: 'crystals', u: 0.52, v: 0.52, scale: 1.05 }
              ],
              decor: [
                { x: 3, y: 1, icon: 'ritual_marks' },
                { x: 11, y: 1, icon: 'crystal_cluster', mode: 'sprite', scale: 0.9 },
                { x: 7, y: 7, icon: 'ritual_marks' }
              ],
              events: [
                {
                  x: 5, y: 1,
                  once: true,
                  visual: 'pickup',
                  icon: 'crystal',
                  examine: '第一枚星痕里蜷着一道尚未拥有方向的风。',
                  hint: '你托住第一枚星痕。风有了方向，右侧冻结的经纬随之解开。',
                  set: [{ x: 6, y: 1, ch: '.' }]
                },
                {
                  x: 9, y: 7,
                  once: true,
                  visual: 'pickup',
                  icon: 'rune',
                  examine: '第二枚星痕反复映出道路，却没有一条抵达终点。',
                  hint: '你替第二枚星痕选定一条仍能前行的路。横断回廊的墙从星图上被擦去。',
                  set: [{ x: 6, y: 7, ch: '.' }]
                },
                {
                  x: 1, y: 7,
                  once: true,
                  visual: 'pickup',
                  icon: 'gem',
                  examine: '第三枚星痕没有光，只有一个等待被定义的中心。',
                  hint: '世界种子回应了第三枚星痕。三点连成星图，中心之门从空白里显形。',
                  set: [{ x: 5, y: 3, ch: 'D' }]
                }
              ]
            },
            links: [
              {
                to: 'corridor_exit',
                label: '跨过中心之门，回到星图',
                requires: function (S) { return !!S.corridorLit; },
                showWhenLocked: true,
                lockHint: '先点亮三枚星痕，再找到中心之门'
              },
              {
                to: 'corridor_threshold',
                label: '退回断层边缘，重新辨认星图',
                requires: function (S) { return !S.corridorLit; }
              }
            ]
          },

          corridor_exit: {
            kind: 'scene',
            name: '星图中心',
            map: { x: 84, y: 45 },
            scene: {
              region: 'ruins',
              mood: 'holy',
              transition: 'fade',
              elements: [
                { kind: 'item', ref: '中心星环', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '三点星痕', art: CONSTELLATION_ART },
                { kind: 'item', ref: '已连成的星图', art: 'scroll' },
                { kind: 'item', ref: '温热的世界种子', art: 'crystal' }
              ]
            },
            audio: {
              music: { preset: 'sacral', tempo: 50, timbre: { pad: 'organ', bass: 'organ' } },
              ambient: 'night',
              sfx: ['success']
            },
            look: '你从中心之门跨出，重新落回星图正面。方才走过的房间缩成三枚相连的坐标；你终于明白，世界不是隔着天穹被创造的，而是要有人进入它的黑暗，亲自走出第一条可行的路。\n\n前方，空白案台正在等待这颗已有温度的世界种子。',
            links: [
              {
                to: 'loom',
                label: '把走过的路带进星图工坊'
              }
            ]
          },

          loom: {
            kind: 'scene',
            name: '星图工坊',
            map: { x: 82, y: 37 },
            scene: {
              region: 'ruins',
              mood: 'sacred',
              transition: 'fade',
              elements: [
                { kind: 'item', ref: '黄道星环', art: CELESTIAL_RING_ART },
                { kind: 'item', ref: '空白案台', art: 'altar' },
                { kind: 'item', ref: '未竟星图', art: 'scroll' },
                { kind: 'character', ref: '制图者', art: 'robed' },
                { kind: 'item', ref: '世界种子', art: 'crystal' }
              ]
            },
            audio: {
              music: {
                preset: 'sacral',
                tempo: 52,
                rhythm: { bassPattern: 'pedal' },
                timbre: { pad: 'organ', bass: 'organ' }
              },
              ambient: false
            },
            look: function (S) {
              var chosen = S.worldShape
                ? '\n你已经写下第一组数据：' + S.worldShape + '。暗星的表面浮出细小的地形。'
                : '\n它还缺第一组数据。你写下什么，什么就会成为那里的第一条规律。';
              var scar = S.flags.kneeDown
                ? '\n你肩上的裂伤提醒你：失败没有把故事截断，它只是把你送到了另一处入口。'
                : '\n你稳住天空的方式留在星图里，成为这个世界最初的平衡。';
              return '星图中心没有王座，只有一张等待输入的空白案台。你把世界种子放上去，周围的连线便逐项展开：地点、天气、声音、选择。' + chosen + scar;
            },
            links: [
              {
                id: 'shape_sea',
                label: '写入一片会记住月亮的海',
                once: true,
                requires: function (S) { return !S.worldShape; },
                run: function (S) {
                  S.worldShape = '潮汐会记住每一次选择';
                  S.insight += 1;
                  return '数据落下，暗星里有了第一阵潮声。';
                }
              },
              {
                id: 'shape_city',
                label: '写入一座会为旅人亮灯的城',
                once: true,
                requires: function (S) { return !S.worldShape; },
                run: function (S) {
                  S.worldShape = '每扇门都通向一个真实的选择';
                  S.insight += 1;
                  return '数据落下，暗星里依次亮起窗灯。';
                }
              },
              {
                id: 'shape_path',
                label: '写入一条失败后仍能前行的路',
                once: true,
                requires: function (S) { return !S.worldShape; },
                run: function (S) {
                  S.worldShape = '失败改变处境，但不终止故事';
                  S.insight += 1;
                  return '数据落下，一条路绕过断崖，继续伸向远方。';
                }
              },
              {
                to: 'first_world',
                label: '把第一组数据送入暗星，点亮它',
                run: function (S) {
                  if (!S.worldShape) S.worldShape = '先让未知拥有可以被探索的形状';
                  S.flags.ignitionChosen = true;
                }
              }
            ]
          },

          first_world: {
            kind: 'cutscene',
            title: '终章 · 第一个世界',
            map: { x: 94, y: 16 },
            beats: [
              {
                dur: 3.2,
                text: '你把那组数据按进暗星。起初，只有一根细线发亮。',
                scene: {
                  region: 'night',
                  mood: 'dawn',
                  transition: 'fade',
                  elements: [
                    { kind: 'item', ref: '创世星环', art: CELESTIAL_RING_ART },
                    { kind: 'item', ref: '第一根星线', art: CONSTELLATION_ART },
                    { kind: 'item', ref: '未点亮的世界', art: 'crystal' },
                    { kind: 'character', ref: '阿特拉斯', art: 'figure' }
                  ]
                },
                audio: {
                  music: { preset: 'sacral', tempo: 44, timbre: { pad: 'choir', bass: 'organ' } },
                  ambient: 'night',
                  sfx: ['magic']
                }
              },
              {
                dur: 3.8,
                text: [
                  '线变成海岸、道路、门与远方的灯。',
                  '风开始吹，第一道可被选择的路在地平线上展开。'
                ],
                scene: {
                  region: 'skyclouds',
                  mood: 'radiant',
                  elements: [
                    { kind: 'item', ref: '黎明云冠', art: 'cloud' },
                    { kind: 'item', ref: '新世界山脉', art: 'mountain' },
                    { kind: 'item', ref: '归途', art: 'house' },
                    { kind: 'character', ref: '承载者', art: 'figure' },
                    { kind: 'item', ref: '新生世界', art: 'sun' }
                  ]
                },
                audio: {
                  music: {
                    preset: 'sacral',
                    tempo: 58,
                    instruments: ['pad', 'bass', 'lead'],
                    intensity: 0.78,
                    melody: 'motif:[0,2,4,7]',
                    rhythm: { bassPattern: 'pedal' },
                    padContour: 0.18,
                    timbre: { pad: 'choir', bass: 'organ', lead: 'reed' }
                  },
                  ambient: 'wind',
                  sfx: ['success']
                }
              },
              {
                dur: 3.6,
                text: '你依旧扛着天空。但肩上的不再是空荡的夜，而是一个个由数据点亮、能够呼吸与回应的世界。'
              },
              {
                hold: true,
                text: '从此，阿特拉斯不只承受世界。阿特拉斯让世界开始。',
                run: function (S) { S.flags.worldLit = true; }
              }
            ],
            links: []
          }
        }
      }
    }
  };
});
