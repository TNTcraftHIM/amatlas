/* ════════════════════════════════════════════════════════════════════════
   Amatlas 恐怖短片 世界数据(文字冒险模块,kind='scene')—— S10 presenter 品质压测
   ════════════════════════════════════════════════════════════════════════
   一个 4 节点的恐怖文字冒险短片。**作者一行动画/素材代码都没写**——只声明 scene/audio
   **意图**:画幅黑边(letterbox)、墙上注视的眼睛(eyes·watching)、门后渗血的巨眼
   (eyes·bleeding·fullscreen)、切换意图(transition: fade 柔和 / slam 猛烈 / cut 直切)、
   惊悚音(bgm ambient-unease / sfx horror-sting·flesh-tear)。**怎么画、怎么动、怎么合成,
   全是 presenter 的事**(契约 §4.2"意图非素材")。换回纯 present-dom 仍可读(优雅退化)。

   节点 kind='scene' 由 text-adventure 模块负责;移动走 links.to;节点挂的 scene/audio
   由 renderer.js 原生透传进 View,呈现器各自消费(见 lessons ㉗:意图非素材)。
   ════════════════════════════════════════════════════════════════════════ */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.HORROR_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    id: 'eef3348a-f26b-424d-8a2a-d1b66f9aca3c',
    start: { map: 'descent', node: 'waking' },
    seed: 20260531,
    maps: {

      descent: {
        name: '坠落',
        nodes: {

          waking: {
            kind: 'scene',
            name: '醒转',
            // transition:'fade' —— 进入起点时柔和淡入(presenter 决定具体动画)。
            scene: { region: 'room', mood: 'eerie', elements: [ { kind: 'letterbox' } ], transition: 'fade' },
            audio: { bgm: 'ambient-unease' },
            look: {
              first: '你在黑暗里睁开眼。地板是湿的,空气里有铁锈味。\n你不记得自己是谁,也不记得这是哪里。',
              return: '你回到醒转的角落。湿冷的地板,铁锈味。黑暗一点没变。'
            },
            links: [ { label: '摸索着走向走廊', to: 'corridor' } ]
          },

          corridor: {
            kind: 'scene',
            name: '走廊',
            // watching 的眼睛 + 画幅黑边;ref='3' 提示"三道目光"(presenter 据此画几只眼)。
            scene: { region: 'night', mood: 'dread', elements: [ { kind: 'letterbox' }, { kind: 'eyes', state: 'watching', ref: '3' } ], transition: 'fade' },
            audio: { bgm: 'ambient-unease' },
            look: {
              first: '走廊尽头有一扇门。墙壁上的裂缝……像是在看着你。\n你数了数:三道裂缝,三道目光。',
              return: '裂缝仍在墙上。它们没有移动——但你确定,刚才不是这个角度。'
            },
            links: [
              { label: '推开那扇门', to: 'beyond' },
              { label: '退回醒转的角落', to: 'waking' }
            ]
          },

          beyond: {
            kind: 'scene',
            name: '门后',
            // 高潮:transition:'slam' 猛切 + 渗血的全屏巨眼 + bgm 骤停、惊悚刺针 horror-sting。
            scene: { region: 'night', mood: 'horror-climax', elements: [ { kind: 'letterbox' }, { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' } ], transition: 'slam' },
            audio: { bgm: null, sfx: [ 'horror-sting' ] },
            look: {
              first: '门后没有房间。\n门后是一只眼睛——和整面墙一样大,正在流血,正在看着你。',
              return: '那只眼睛还在。它一直都在。血从它下面淌成一片。'
            },
            links: [
              { label: '凝视回去', to: 'consumed' },
              { label: '猛地关上门', to: 'corridor' }
            ]
          },

          consumed: {
            kind: 'scene',
            name: '——',
            // 结局:transition:'cut' 直切(诚实的"不做过渡也是一种意图")+ 撕裂音 flesh-tear。
            scene: { region: 'night', mood: 'horror-climax', elements: [ { kind: 'letterbox' }, { kind: 'eyes', state: 'bleeding', ref: 'fullscreen' } ], transition: 'cut' },
            audio: { sfx: [ 'flesh-tear' ] },
            look: '你眨了眨眼。\n\n然后,眼睛没有再睁开。\n\n(这是结局。点击下方「重开」再来一次。)',
            links: []
          }

        }
      }

    }
  };
});
