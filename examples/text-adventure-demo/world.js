/* ════════════════════════════════════════════════════════════════════════
   Amatlas 文字冒险 demo 世界数据(文字冒险模块)—— 移植自 world-engine.html 的 beach/forest 示例。
   ════════════════════════════════════════════════════════════════════════
   节点 kind='scene'(由 text-adventure 模块负责);作者只写"数据",引擎是解释器。
   演示模型全部要素:多地图 + 跨图传送、look(首次/重访/函数)、links(移动/纯动作/
   once/requires 隐藏/showWhenLocked 灰显)、events beat(进入触发 + once / 时钟推进)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.TEXT_ADVENTURE_DEMO_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    id: 'b229401b-9582-463d-bd08-1ce3e901211f',
    start: { map: 'beach', node: 'shore' },
    seed: 20260529,
    initState: { inventory: [] },   // 物品栏:拾取的东西(如皮箱)推进 state.inventory;本作在状态条用文字显示(game.js status),富 UI 面板见物品栏插件(examples/maze3d/ 的 horror recipe 🎒)。预声明=对齐推荐写法 + 防 reset 后缺字段
    maps: {

      beach: {
        name: '黑沙滩',
        nodes: {
          shore: {
            kind: 'scene',
            name: '海岸',
            map: { x: 28, y: 78 },          // 玩家地图坐标(0–100 归一,模块私有、核心不读;给 minimap spatial 视图摆位)
            // 可选 scene/audio 意图(契约 §4.2)。renderer.js 原生把它们透传进 View,
            // SVG/音频呈现器各自消费——挂则有视觉/音,不挂则纯文字优雅退化。
            scene: { region: 'beach', mood: 'calm' },
            audio: { bgm: 'theme-beach' },
            look: function (S, first) {
              return first
                ? '你睁开眼,被冲上一片黑色的沙滩。咸涩的风里有金属的味道,远处紫色的森林轮廓在发抖。'
                : '熟悉的黑沙滩。浪一遍遍拍上来,又退回去。';
            },
            events: [
              { id: 'find_case', once: true, when: function (S) { return !S.flags.foundCase; },
                run: function (S) {
                  S.flags.foundCase = true;
                  (S.inventory || (S.inventory = [])).push('雷纳的皮箱');
                  return '你的手碰到沙里一个硬物——一只旧皮箱,锁扣上刻着「R.H.」。';
                } }
            ],
            links: [
              { label: '沿海岸走到礁石潮池', to: 'tidepool' },
              { label: '走向那片紫色森林', to: { map: 'forest', node: 'edge' } },
              { label: '打开皮箱看看(只能仔细看一次)', once: true, id: 'open_case',
                requires: function (S) { return S.flags.foundCase; }, showWhenLocked: true,
                lockHint: '你手上还没有可看的东西',
                run: function (S) {
                  S.flags.readNotes = true;
                  S.understanding = (S.understanding || 0) + 1;
                  return '你打开皮箱,里面只有几页受潮的笔记。雷纳反复画着森林深处的光点,旁边写着:“不要跟丢它。”';
                } }
            ]
          },
          tidepool: {
            kind: 'scene',
            name: '礁石潮池',
            map: { x: 72, y: 56 },
            scene: { region: 'sea', mood: 'cold' },
            audio: { bgm: 'theme-beach', sfx: ['pickup'] },
            look: { first: '退潮后的礁石间积着一汪汪水,倒映着灰白的天。水里有细小的发光生物。',
                    return: '潮池还在。发光的小生物随你的影子缩回石缝。' },
            links: [ { label: '回到海岸', to: 'shore' } ]
          }
        }
      },

      forest: {
        name: '紫色森林',
        nodes: {
          edge: {
            kind: 'scene',
            name: '森林边缘',
            map: { x: 26, y: 72 },
            scene: { region: 'forest', mood: 'eerie', elements: [ { kind: 'hazard', ref: '光点' } ] },
            audio: { bgm: 'theme-forest' },
            look: function (S) {
              return '高大的紫色蕨类挡住了光。林子深处有微弱的、移动的光点。'
                + (S.flags.readNotes ? '\n你想起皮箱里的笔记——雷纳画过这种光。' : '');
            },
            links: [
              { label: '退回海滩', to: { map: 'beach', node: 'shore' } },
              { label: '循着光点深入森林', to: 'deep',
                requires: function (S) { return S.flags.readNotes; }, showWhenLocked: true,
                lockHint: '你总觉得贸然深入并不明智' }
            ]
          },
          deep: {
            kind: 'scene',
            name: '森林深处',
            map: { x: 70, y: 28 },
            scene: { region: 'night', mood: 'tense', elements: [ { kind: 'character', ref: '提灯人' } ] },
            audio: { bgm: 'theme-night' },
            look: '光点在叶隙间游动,像有人提着灯走过。空气是甜的。',
            events: [
              { id: 'nightfall', once: true, when: function (S) { return (S.clock.t || 0) < 2; },
                run: function (S) { S.clock.t = 2; return '——你在森林里失去了时间。再回神时,已是第二天。——'; } }
            ],
            links: [
              { label: '往回走', to: 'edge' },
              { label: '跟上提灯人', to: 'lantern' }
            ]
          },
          lantern: {
            kind: 'scene',
            name: '灯下的名字',
            map: { x: 88, y: 18 },
            scene: { region: 'forest', mood: 'calm', elements: [ { kind: 'character', ref: '提灯人' }, { kind: 'item', art: 'key' } ] },
            audio: { bgm: 'theme-calm', sfx: [ 'success' ] },
            look: '提灯人在树影尽头停下,把灯递给你。灯罩内侧刻着你的名字。\n\n你终于明白:雷纳不是在追逐光点,他是在给后来的人留下回家的方向。海风从林外吹来,黑沙滩上的潮声像一扇门慢慢打开。\n\n—— 结局:你找到了回家的路。点击上方「重新开始」可以再走一次。',
            links: []
          }
        }
      }

    }
  };
});
