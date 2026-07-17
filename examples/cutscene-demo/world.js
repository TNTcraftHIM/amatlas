/* ════════════════════════════════════════════════════════════════════════
   Amatlas cutscene example 世界数据 —— 「灯塔回潮」
   ════════════════════════════════════════════════════════════════════════
   主体玩法是普通文字冒险 kind:'scene';kind:'cutscene' 只用于开局、关键剧情、结尾。
   这个范本刻意把正文段写回 text-adventure-demo 的原生心智:look/links/events/map/audio,
   而不是把所有节点都做成电影舞台。

   音频路线:
     1. intro 第 0 拍声明 music:'elegy' + ambient:'waves' → present-audio 统一淡入。
     2. intro 后续拍不写 audio → v15 继承,同一首音乐不重启。
     3. 普通 scene 写同 key music:'elegy' → 玩法段仍是原生布局,音乐也不重启。
     4. turning 第 0 拍改 music:'tense' → 旧曲淡出、新曲淡入(交叉淡变)。
     5. finale 改 music:'lullaby' 且 ambient:false → 结尾收束。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.CUTSCENE_DEMO_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function addItem(S, item) {
    var inv = S.inventory || (S.inventory = []);
    if (inv.indexOf(item) < 0) inv.push(item);
  }

  return {
    id: '00e20249-3252-44e4-8d98-3438d2a51828',
    start: { map: 'coast', node: 'intro' },
    seed: 20260704,
    initState: { inventory: [] },
    maps: {
      coast: {
        name: '雾海岸',
        nodes: {

          intro: {
            kind: 'cutscene',
            title: '序章 · 回潮',
            map: { x: 18, y: 80 },
            beats: [
              { dur: 3,
                text: '黑潮退去时,旧灯塔第一次在雾里亮起。先到的不是光,是从远处推来的低音。',
                scene: { region: 'night', mood: 'tense', transition: 'fade' },
                audio: { music: 'elegy', ambient: 'waves' } },
              { dur: 4,
                text: ['海面像一张慢慢展开的地图。', '每一道浪线,都指向同一个名字。'] },
              { dur: 4,
                text: '白光扫过黑沙滩,把潮池里的蓝火一枚枚点亮。',
                scene: { region: 'sea', mood: 'mystic', elements: [ { kind: 'item', ref: '蓝火潮池' } ] } },
              { hold: true,
                text: '光停在你脚边。点「▸」结束演出，或选择下方出口踏上沙滩开始调查。',
                run: function (S) { S.flags.intro_seen = true; } }
            ],
            links: [ { to: 'shore', label: '踏上沙滩' } ]
          },

          shore: {
            kind: 'scene',
            name: '黑沙滩',
            map: { x: 30, y: 72 },
            scene: { region: 'beach', mood: 'calm', transition: 'fade' },
            audio: { music: 'elegy', ambient: 'waves' },
            look: function (S, first) {
              var head = S.flags.intro_seen ? '刚才那道白光还残在黑沙上。' : '雾压着海岸,灯塔在远处沉默。';
              var note = S.flags.tide_mark ? '\n你已经记下潮线:蓝火会在第三次回潮时同时亮起。' : '';
              return first
                ? head + '脚下有一串被潮水擦亮的刻痕,像某人用很久的时间写下的方向。' + note
                : head + '海风把盐、铁锈和旧木头的气味吹在一起。' + note;
            },
            links: [
              { id: 'read_tide', label: '读潮线刻痕', once: true,
                run: function (S) {
                  S.flags.tide_mark = true;
                  addItem(S, '潮线刻度');
                  return '刻痕不是警告,而是一张潮汐表:第三次回潮时,灯塔会打开一次门。';
                } },
              { to: 'tidepool', label: '走向发蓝光的潮池' }
            ]
          },

          tidepool: {
            kind: 'scene',
            name: '蓝火潮池',
            map: { x: 58, y: 58 },
            scene: { region: 'sea', mood: 'mystic', transition: 'fade', elements: [ { kind: 'item', ref: '蓝火' } ] },
            audio: { music: 'elegy', ambient: 'waves' },
            look: function (S) {
              return '潮池里浮着一小团蓝火,风吹不灭,水也浸不冷。'
                + (S.flags.blue_fire ? '\n它已经落进你的提灯,照出通往灯塔的暗路。' : '\n你伸手时,它像一只很轻的鱼,贴着掌心游过。');
            },
            links: [
              { id: 'take_fire', label: '把蓝火引入提灯', once: true,
                run: function (S) {
                  S.flags.blue_fire = true;
                  addItem(S, '蓝火提灯');
                  return '蓝火没有烫伤你。它在提灯里安静下来,把雾照成很深的蓝。';
                } },
              { to: 'turning', label: '循着蓝火走向灯塔',
                requires: function (S) { return !!S.flags.blue_fire; }, showWhenLocked: true,
                lockHint: '先把蓝火引入提灯' },
              { to: 'shore', label: '回到黑沙滩' }
            ]
          },

          turning: {
            kind: 'cutscene',
            title: '关键剧情 · 门后的海',
            map: { x: 72, y: 40 },
            beats: [
              { dur: 3,
                text: '蓝火靠近灯塔门时,原本温柔的旋律被截断。塔内响起更低、更近的鼓点。',
                scene: { region: 'night', mood: 'tense', transition: 'slam', elements: [ { kind: 'hazard', ref: '灯塔门' }, { kind: 'item', ref: '蓝火提灯' } ] },
                audio: { music: 'tense', ambient: 'wind' } },
              { dur: 4,
                text: ['门缝里不是房间,而是一片倒悬的海。', '所有浪声都从你身后涌来,像有人在塔内呼吸。'] },
              { dur: 4,
                text: '你看见塔心悬着一面旧星镜。镜面里,海岸、潮池和你刚走过的路正在重新排列。',
                scene: { region: 'forest', mood: 'eerie', elements: [ { kind: 'item', art: 'key' }, { kind: 'character', ref: '守灯人' } ] } },
              { hold: true,
                text: '守灯人的影子让开一步。接下来又回到普通调查:选择、查看、推进。',
                run: function (S) { S.flags.turning_seen = true; } }
            ],
            links: [ { to: 'tower', label: '进入灯塔' } ]
          },

          tower: {
            kind: 'scene',
            name: '灯塔塔心',
            map: { x: 84, y: 24 },
            scene: { region: 'night', mood: 'tense', transition: 'fade', elements: [ { kind: 'item', art: 'key' } ] },
            audio: { music: 'tense', ambient: 'wind' },
            look: function (S) {
              return '塔心没有楼梯,只有一面悬空的星镜。镜边刻着许多名字,其中一个正慢慢亮起来。'
                + (S.flags.mirror_aligned ? '\n你已经把星镜调到回潮的角度,海面上的光路完整接上了。' : '\n镜面还偏着半寸,光路在海面上断成两截。');
            },
            links: [
              { id: 'align_mirror', label: '校准星镜', once: true,
                run: function (S) {
                  S.flags.mirror_aligned = true;
                  addItem(S, '对准的星镜');
                  return '你按潮线刻度转动镜框。咔哒一声,海面、潮池和灯塔三点连成了一条光路。';
                } },
              { to: 'finale', label: '点亮灯塔',
                requires: function (S) { return !!S.flags.mirror_aligned; }, showWhenLocked: true,
                lockHint: '先校准星镜' },
              { to: 'tidepool', label: '回到潮池再听一次海' }
            ]
          },

          finale: {
            kind: 'cutscene',
            title: '终章 · 灯归海上',
            map: { x: 92, y: 12 },
            beats: [
              { dur: 4,
                text: '灯塔亮起时,紧绷的鼓点松开。光从塔顶落到海面,像替每一道浪找回归处。',
                scene: { region: 'sea', mood: 'calm', transition: 'fade', elements: [ { kind: 'item', ref: '灯塔光' } ] },
                audio: { music: 'lullaby', ambient: false } },
              { dur: 4,
                text: ['雾退到远处。蓝火在提灯里熄灭,只剩温热的玻璃。', '你知道下一次回潮时,这里会有人看见路。'] },
              { hold: true,
                text: '(完)—— 这是一个主体玩法中穿插 cutscene 的正式范本。',
                run: function (S) { S.flags.story_done = true; } }
            ],
            links: []
          }
        }
      }
    }
  };
});
