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

  var HUMANOID_FRONT_PARTS = [
    { id: 'torso', parent: null,
      art: [
        { shape: 'path', d: 'M -13 -18 Q 0 -22 13 -18 L 11 16 Q 0 20 -11 16 Z', fill: '#85505a', stroke: '#392735', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 160, y: 105, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'leg_l', parent: 'torso',
      art: [
        { shape: 'path', d: 'M -4 0 L 4 0 L 5 30 L -5 30 Z', fill: '#41364d', stroke: '#241b2c', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: -7, y: 14, rotate: 2, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'leg_r', parent: 'torso',
      art: [
        { shape: 'path', d: 'M -4 0 L 4 0 L 5 30 L -5 30 Z', fill: '#54405b', stroke: '#241b2c', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 7, y: 14, rotate: -2, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'arm_l_upper', parent: 'torso',
      art: [
        { shape: 'path', d: 'M -3 0 L 3 0 L 4 21 L -4 21 Z', fill: '#a96b70', stroke: '#432c38', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: -13, y: -14, rotate: 12, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'arm_l_fore', parent: 'arm_l_upper',
      art: [
        { shape: 'path', d: 'M -3 0 L 3 0 L 4 19 L -4 19 Z', fill: '#c99386', stroke: '#432c38', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 0, y: 20, rotate: -4, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'hand_l', parent: 'arm_l_fore',
      art: [
        { shape: 'circle', cx: 0, cy: 3, r: 4, fill: '#d3a195', stroke: '#432c38', sw: 0.8 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 0, y: 18, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'arm_r_upper', parent: 'torso',
      art: [
        { shape: 'path', d: 'M -3 0 L 3 0 L 4 21 L -4 21 Z', fill: '#a96b70', stroke: '#432c38', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 13, y: -14, rotate: -12, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'arm_r_fore', parent: 'arm_r_upper',
      art: [
        { shape: 'path', d: 'M -3 0 L 3 0 L 4 19 L -4 19 Z', fill: '#c99386', stroke: '#432c38', sw: 1 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 0, y: 20, rotate: 4, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'hand_r', parent: 'arm_r_fore',
      art: [
        { shape: 'path', d: 'M -4 4 Q -5 -2 -2 -3 L 0 -8 L 2 -3 L 4 -7 L 4 1 Q 6 4 2 7 Z', fill: '#d3a195', stroke: '#432c38', sw: 0.8 }
      ],
      pivot: { x: 0, y: 0 },
      rest: { x: 0, y: 18, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'head', parent: 'torso',
      art: [
        { shape: 'circle', cx: 0, cy: 0, r: 15, fill: '#d8b5ab', stroke: '#3a2935', sw: 1 },
        { shape: 'path', d: 'M -14 -3 Q -12 -17 0 -17 Q 12 -17 14 -3 Q 5 -11 0 -11 Q -7 -11 -14 -3 Z', fill: '#382b3d' }
      ],
      pivot: { x: 0, y: 8 },
      rest: { x: 0, y: -30, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'hair_tip', parent: 'head',
      art: [
        { shape: 'path', d: 'M 8 -9 Q 17 -4 12 9 Q 9 3 5 -2 Z', fill: '#382b3d', stroke: '#241b2c', sw: 0.7 }
      ],
      pivot: { x: 7, y: -7 },
      rest: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'eyes', parent: 'head',
      art: [
        { shape: 'ellipse', cx: -5, cy: -2, rx: 2.4, ry: 1.5, fill: '#211923' },
        { shape: 'ellipse', cx: 5, cy: -2, rx: 2.4, ry: 1.5, fill: '#211923' }
      ],
      pivot: { x: 0, y: -2 },
      rest: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },

    { id: 'mouth', parent: 'head',
      art: [
        { shape: 'path', d: 'M -5 5 Q 0 8 5 5', fill: 'none', stroke: '#681f32', sw: 1.2 }
      ],
      pivot: { x: 0, y: 5 },
      rest: { x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } }
  ];

  var HUMANOID_FRONT_DRAW_ORDER = [
    'leg_l', 'leg_r',
    'arm_l_upper', 'arm_l_fore', 'hand_l',
    'torso', 'head', 'hair_tip', 'eyes', 'mouth',
    'arm_r_upper', 'arm_r_fore', 'hand_r'
  ];

  var HUMANOID_WAVE_TRACKS = [
    { target: 'torso', property: 'scaleX', keys: [
      { at: 0.5, value: 1.025, ease: 'ease-out' },
      { at: 1.0, value: 1, ease: 'ease-in-out' }
    ] },
    { target: 'head', property: 'rotate', keys: [
      { at: 0.7, value: -5, ease: 'ease-out' },
      { at: 3.6, value: 0, ease: 'ease-in-out' }
    ] },
    { target: 'arm_r_upper', property: 'rotate', keys: [
      { at: 0.7, value: -132, ease: 'ease-out' },
      { at: 3.2, value: -132, ease: 'linear' },
      { at: 4.0, value: -48, ease: 'ease-in-out' }
    ] },
    { target: 'arm_r_fore', property: 'rotate', keys: [
      { at: 0.8, value: -18, ease: 'ease-out' },
      { at: 1.35, value: 22, ease: 'ease-in-out' },
      { at: 1.9, value: -18, ease: 'ease-in-out' },
      { at: 2.45, value: 22, ease: 'ease-in-out' },
      { at: 3.0, value: -18, ease: 'ease-in-out' },
      { at: 4.0, value: 4, ease: 'ease-in-out' }
    ] },
    { target: 'hand_r', property: 'rotate', keys: [
      { at: 1.35, value: 12, ease: 'ease-out' },
      { at: 1.9, value: -12, ease: 'ease-in-out' },
      { at: 2.45, value: 12, ease: 'ease-in-out' },
      { at: 3.0, value: 0, ease: 'ease-in-out' }
    ] }
  ];

  var HUMANOID_WAVE_VARIANTS = [
    { target: 'eyes', base: 'open', states: [
      { id: 'closed', art: [
        { shape: 'line', x1: -8, y1: -2, x2: -2, y2: -2, stroke: '#211923', sw: 1.3 },
        { shape: 'line', x1: 2, y1: -2, x2: 8, y2: -2, stroke: '#211923', sw: 1.3 }
      ] }
    ], keys: [
      { at: 1.55, value: 'closed' },
      { at: 1.68, value: 'open' }
    ] },
    { target: 'mouth', base: 'rest', states: [
      { id: 'A', art: [
        { shape: 'ellipse', cx: 0, cy: 6, rx: 4, ry: 3.2, fill: '#681f32' }
      ] },
      { id: 'O', art: [
        { shape: 'ellipse', cx: 0, cy: 6, rx: 2.7, ry: 3.7, fill: 'none', stroke: '#681f32', sw: 1.2 }
      ] }
    ], keys: [
      { at: 0.75, value: 'A' },
      { at: 1.1, value: 'O' },
      { at: 1.45, value: 'rest' },
      { at: 2.0, value: 'A' },
      { at: 2.35, value: 'O' },
      { at: 2.75, value: 'rest' }
    ] }
  ];

  var HUMANOID_WAVE_SECONDARY = [
    { type: 'follow', source: { target: 'head', property: 'rotate' },
      target: 'hair_tip', property: 'rotate', delayMs: 100, gain: 0.6, min: -8, max: 8 },
    { type: 'oscillate', target: 'torso', property: 'scaleY',
      periodMs: 2200, amplitude: 0.015, phase: 0.25 },
    { type: 'blink', target: 'eyes', property: 'scaleY', closedValue: 0.08,
      windowMs: 2400, durationMs: 110, chance: 0.7, seed: 19088743 },
    { type: 'noise', target: 'head', property: 'x',
      windowMs: 600, amplitude: 0.3, seed: 2309737967 }
  ];

  function makeStaticActorRig(rootX, bodyFill) {
    return {
      parts: [
        { id: 'body', parent: null,
          art: [
            { shape: 'circle', cx: 0, cy: -18, r: 11, fill: '#d8b5ab', stroke: '#3a2935', sw: 1 },
            { shape: 'path', d: 'M -11 -5 Q 0 -10 11 -5 L 9 25 L -9 25 Z', fill: bodyFill, stroke: '#392735', sw: 1 }
          ],
          pivot: { x: 0, y: 0 },
          rest: { x: rootX, y: 112, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } }
      ],
      drawOrder: ['body'],
      tracks: [],
      variants: [],
      secondary: []
    };
  }

  function makeDialogueActorRig(rootX, bodyFill, mouthKeys) {
    return {
      parts: [
        { id: 'body', parent: null,
          art: [
            { shape: 'circle', cx: 0, cy: -14, r: 13, fill: '#d8b5ab', stroke: '#3a2935', sw: 1 },
            { shape: 'path', d: 'M -12 0 Q 0 -7 12 0 L 10 24 L -10 24 Z', fill: bodyFill, stroke: '#392735', sw: 1 }
          ],
          pivot: { x: 0, y: 0 },
          rest: { x: rootX, y: 112, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } },
        { id: 'mouth', parent: 'body',
          art: [
            { shape: 'path', d: 'M -4 0 Q 0 2 4 0', fill: 'none', stroke: '#681f32', sw: 1.1 }
          ],
          pivot: { x: 0, y: 0 },
          rest: { x: 0, y: -8, rotate: 0, scaleX: 1, scaleY: 1, opacity: 1 } }
      ],
      drawOrder: ['body', 'mouth'],
      tracks: [],
      variants: [
        { target: 'mouth', base: 'rest', states: [
          { id: 'A', art: [
            { shape: 'ellipse', cx: 0, cy: 1, rx: 4.2, ry: 3.2, fill: '#681f32' }
          ] },
          { id: 'O', art: [
            { shape: 'ellipse', cx: 0, cy: 1, rx: 2.8, ry: 3.8, fill: 'none', stroke: '#681f32', sw: 1.2 }
          ] }
        ], keys: mouthKeys }
      ],
      secondary: []
    };
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
                text: { mode: 'typewriter', lines: [
                  { cps: 14, chunks: [ { text: '海面像一张慢慢展开的地图。', pauseAfter: 0.32 } ] },
                  { cps: 14, chunks: [
                    { text: '每一道浪线,', pauseAfter: 0.28 },
                    { text: '都指向同一个名字。', cps: 11 }
                  ] }
                ] },
                motion: {
                  layers: [
                    { id: 'tide_ship', art: 'ship', x: 42, y: 132, scale: 0.55, rotate: -5, opacity: 0 },
                    { id: 'guide_lamp', art: 'lantern', x: 42, y: 110, scale: 0.4, opacity: 0 }
                  ],
                  tracks: [
                    { target: 'tide_ship', property: 'x', keys: [ { at: 3.6, value: 250, ease: 'ease-in-out' } ] },
                    { target: 'tide_ship', property: 'y', keys: [ { at: 1.8, value: 118, ease: 'ease-out' }, { at: 3.6, value: 126, ease: 'ease-in-out' } ] },
                    { target: 'tide_ship', property: 'scale', keys: [ { at: 3.6, value: 0.9, ease: 'ease-out' } ] },
                    { target: 'tide_ship', property: 'rotate', keys: [ { at: 3.6, value: 2, ease: 'ease-in-out' } ] },
                    { target: 'tide_ship', property: 'opacity', keys: [ { at: 0.7, value: 1, ease: 'ease-out' } ] },
                    { target: 'guide_lamp', property: 'x', keys: [ { at: 3.6, value: 250, ease: 'ease-in-out' } ] },
                    { target: 'guide_lamp', property: 'y', keys: [ { at: 1.8, value: 96, ease: 'ease-out' }, { at: 3.6, value: 104, ease: 'ease-in-out' } ] },
                    { target: 'guide_lamp', property: 'scale', keys: [ { at: 3.6, value: 0.65, ease: 'ease-out' } ] },
                    { target: 'guide_lamp', property: 'opacity', keys: [ { at: 0.9, value: 1, ease: 'ease-out' } ] }
                  ]
                } },
              { dur: 9.2,
                text: '灯影里的剪纸小人慢慢抬起一只手,却不像在招呼。头歪到不该停住的角度,眼睛半合着;暗红从眼角和歪斜的嘴角一点点垂下来。',
                scene: { region: 'night', mood: 'dread', transition: 'fade' },
                audio: { music: 'elegy', ambient: 'ambient-unease' },
                motion: {
                  layers: [
                    { id: 'paper_shadow', art: [
                      { shape: 'ellipse', cx: 0, cy: 0, rx: 25, ry: 4, fill: '#151322', op: 0.52 }
                    ], x: 160, y: 151, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'leg_back', art: [
                      { shape: 'path', d: 'M -4 0 Q -5 9 -6 22 Q -6 28 -2 30 L 5 30 L 4 21 L 4 0 Z', fill: '#443451', stroke: '#241b2c', sw: 1 },
                      { shape: 'path', d: 'M -6 27 Q 0 25 7 28 L 8 32 L -7 32 Z', fill: '#2e273b', stroke: '#241b2c', sw: 1 }
                    ], x: 153, y: 119, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'leg_front', art: [
                      { shape: 'path', d: 'M -4 0 Q -4 10 -3 21 Q -4 27 -1 30 L 6 30 L 6 21 L 4 0 Z', fill: '#5a3f63', stroke: '#241b2c', sw: 1 },
                      { shape: 'path', d: 'M -2 27 Q 4 25 10 28 L 11 32 L -4 32 Z', fill: '#352b42', stroke: '#241b2c', sw: 1 }
                    ], x: 167, y: 119, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'arm_left_upper', art: [
                      { shape: 'path', d: 'M -3 0 Q 0 -2 3 0 L 4 18 Q 0 23 -4 18 Z', fill: '#a96861', stroke: '#432c38', sw: 1 }
                    ], x: 146, y: 90, scale: 1, rotate: 18, opacity: 1 },
                    { id: 'arm_left_forearm', art: [
                      { shape: 'path', d: 'M -3 0 Q 0 -2 3 0 L 4 17 Q 0 22 -4 17 Z', fill: '#c8927f', stroke: '#432c38', sw: 1 }
                    ], x: 139, y: 111, scale: 1, rotate: 12, opacity: 1 },
                    { id: 'hand_left', art: [
                      { shape: 'path', d: 'M -4 3 Q -5 -2 -2 -3 L -2 -8 L 0 -8 L 1 -4 L 2 -9 L 4 -8 L 3 -3 Q 6 -2 4 4 Q 0 7 -4 3 Z', fill: '#c8927f', stroke: '#432c38', sw: 0.9 }
                    ], x: 135, y: 131, scale: 1, rotate: 12, opacity: 1 },
                    { id: 'arm_right_upper', art: [
                      { shape: 'path', d: 'M -3 0 Q 0 -2 3 0 L 4 18 Q 0 23 -4 18 Z', fill: '#a96861', stroke: '#432c38', sw: 1 }
                    ], x: 174, y: 90, scale: 1, rotate: -18, opacity: 1 },
                    { id: 'torso', art: [
                      { shape: 'path', d: 'M -13 -17 Q 0 -21 13 -17 L 11 15 Q 0 20 -11 15 Z', fill: '#84484a', stroke: '#452a37', sw: 1.1 },
                      { shape: 'line', x1: -9, y1: 5, x2: 9, y2: 5, stroke: '#642d39', sw: 1.2 },
                      { shape: 'circle', cx: 0, cy: -5, r: 2, fill: '#f4d17b', stroke: '#8f4d3e', sw: 0.7 }
                    ], x: 160, y: 106, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'arm_right_forearm', art: [
                      { shape: 'path', d: 'M -3 0 Q 0 -2 3 0 L 4 17 Q 0 22 -4 17 Z', fill: '#c8927f', stroke: '#432c38', sw: 1 }
                    ], x: 180.8, y: 110.9, scale: 1, rotate: -12, opacity: 1 },
                    { id: 'hand_right', art: [
                      { shape: 'path', d: 'M -4 3 Q -5 -2 -2 -3 L -2 -8 L 0 -8 L 1 -4 L 2 -9 L 4 -8 L 3 -3 Q 6 -2 4 4 Q 0 7 -4 3 Z', fill: '#c8927f', stroke: '#432c38', sw: 0.9 }
                    ], x: 185, y: 130.6, scale: 1, rotate: -12, opacity: 1 },
                    { id: 'head', art: [
                      { shape: 'circle', cx: 0, cy: 0, r: 15, fill: '#d8b5ab', stroke: '#3a2935', sw: 1.1 },
                      { shape: 'path', d: 'M -14 -3 Q -13 -16 0 -17 Q 13 -16 14 -3 L 10 -7 Q 5 -12 0 -12 Q -8 -11 -14 -3 Z', fill: '#382b3d', stroke: '#241b2c', sw: 1 },
                      { shape: 'path', d: 'M -13 2 Q -10 13 0 15 Q 10 13 13 2', fill: 'none', stroke: '#966d70', sw: 0.8, op: 0.52 }
                    ], x: 160, y: 65, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'eye_left', art: [
                      { shape: 'ellipse', cx: 0, cy: 0, rx: 2.6, ry: 1.6, fill: '#211923' }
                    ], x: 154.5, y: 62, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'eye_right', art: [
                      { shape: 'ellipse', cx: 0, cy: 0, rx: 2.6, ry: 1.6, fill: '#211923' }
                    ], x: 165.5, y: 62, scale: 1, rotate: 0, opacity: 1 },
                    { id: 'mouth', art: [
                      { shape: 'path', d: 'M -6 -2 Q -3 5 1 3 Q 5 2 7 -4', fill: 'none', stroke: '#681f32', sw: 1.25 }
                    ], x: 160, y: 72, scale: 1, rotate: -4, opacity: 1 },
                    { id: 'blood_eye_left', art: [
                      { shape: 'path', d: 'M 0 0 Q -0.8 4 0.4 9', fill: 'none', stroke: '#6b0000', sw: 1.15 },
                      { shape: 'ellipse', cx: 0.5, cy: 10.5, rx: 1.05, ry: 1.8, fill: '#8b0000' }
                    ], x: 152.3, y: 63.5, scale: 1, rotate: 0, opacity: 0 },
                    { id: 'blood_eye_right', art: [
                      { shape: 'path', d: 'M 0 0 Q 0.8 3.5 -0.2 8.5', fill: 'none', stroke: '#6b0000', sw: 1.1 },
                      { shape: 'ellipse', cx: -0.3, cy: 10, rx: 1, ry: 1.7, fill: '#8b0000' }
                    ], x: 167.7, y: 63.5, scale: 1, rotate: 0, opacity: 0 },
                    { id: 'blood_mouth_left', art: [
                      { shape: 'path', d: 'M 0 0 Q -0.5 3.2 0.3 6.8', fill: 'none', stroke: '#6b0000', sw: 1.05 },
                      { shape: 'ellipse', cx: 0.4, cy: 8, rx: 0.9, ry: 1.5, fill: '#8b0000' }
                    ], x: 154, y: 71.5, scale: 1, rotate: -4, opacity: 0 },
                    { id: 'blood_mouth_right', art: [
                      { shape: 'path', d: 'M 0 0 Q 0.7 2.8 0 6.2', fill: 'none', stroke: '#6b0000', sw: 1 },
                      { shape: 'ellipse', cx: 0, cy: 7.4, rx: 0.85, ry: 1.4, fill: '#8b0000' }
                    ], x: 167, y: 69.5, scale: 1, rotate: -4, opacity: 0 }
                  ],
                  tracks: [
                    { target: 'arm_right_upper', property: 'rotate', keys: [
                      { at: 1.5, value: -18, ease: 'linear' },
                      { at: 4.6, value: -63, ease: 'ease-in' },
                      { at: 7.4, value: -96, ease: 'ease-in-out' },
                      { at: 8.6, value: -111, ease: 'ease-in-out' },
                      { at: 9.2, value: -107, ease: 'ease-out' }
                    ] },
                    { target: 'arm_right_forearm', property: 'x', keys: [
                      { at: 1.5, value: 180.8, ease: 'linear' },
                      { at: 4.6, value: 193.9, ease: 'ease-in' },
                      { at: 7.4, value: 195.7, ease: 'ease-in-out' },
                      { at: 8.6, value: 194.5, ease: 'ease-in-out' },
                      { at: 9.2, value: 194.9, ease: 'ease-out' }
                    ] },
                    { target: 'arm_right_forearm', property: 'y', keys: [
                      { at: 1.5, value: 110.9, ease: 'linear' },
                      { at: 4.6, value: 99.3, ease: 'ease-in' },
                      { at: 7.4, value: 86.2, ease: 'ease-in-out' },
                      { at: 8.6, value: 82.1, ease: 'ease-in-out' },
                      { at: 9.2, value: 83.2, ease: 'ease-out' }
                    ] },
                    { target: 'arm_right_forearm', property: 'rotate', keys: [
                      { at: 1.5, value: -12, ease: 'linear' },
                      { at: 4.6, value: -90, ease: 'ease-in' },
                      { at: 7.4, value: -145, ease: 'ease-in-out' },
                      { at: 8.6, value: -153, ease: 'ease-in-out' },
                      { at: 9.2, value: -148, ease: 'ease-out' }
                    ] },
                    { target: 'hand_right', property: 'x', keys: [
                      { at: 1.5, value: 185, ease: 'linear' },
                      { at: 4.6, value: 213.9, ease: 'ease-in' },
                      { at: 7.4, value: 207.1, ease: 'ease-in-out' },
                      { at: 8.6, value: 203.6, ease: 'ease-in-out' },
                      { at: 9.2, value: 205.5, ease: 'ease-out' }
                    ] },
                    { target: 'hand_right', property: 'y', keys: [
                      { at: 1.5, value: 130.5, ease: 'linear' },
                      { at: 4.6, value: 99.3, ease: 'ease-in' },
                      { at: 7.4, value: 69.8, ease: 'ease-in-out' },
                      { at: 8.6, value: 64.3, ease: 'ease-in-out' },
                      { at: 9.2, value: 66.2, ease: 'ease-out' }
                    ] },
                    { target: 'hand_right', property: 'rotate', keys: [
                      { at: 1.5, value: -12, ease: 'linear' },
                      { at: 4.6, value: -90, ease: 'ease-in' },
                      { at: 7.4, value: -145, ease: 'ease-in-out' },
                      { at: 8.6, value: -153, ease: 'ease-in-out' },
                      { at: 9.2, value: -148, ease: 'ease-out' }
                    ] },
                    { target: 'torso', property: 'scale', keys: [
                      { at: 0.8, value: 1.003, ease: 'ease-in-out' },
                      { at: 1.2, value: 0.998, ease: 'ease-in-out' },
                      { at: 1.6, value: 1.004, ease: 'ease-in-out' },
                      { at: 2, value: 0.997, ease: 'ease-in-out' },
                      { at: 2.4, value: 1.003, ease: 'ease-in-out' },
                      { at: 2.8, value: 0.998, ease: 'ease-in-out' },
                      { at: 3.2, value: 1.004, ease: 'ease-in-out' },
                      { at: 3.6, value: 0.997, ease: 'ease-in-out' },
                      { at: 4, value: 1.003, ease: 'ease-in-out' },
                      { at: 4.4, value: 0.998, ease: 'ease-in-out' },
                      { at: 4.8, value: 1.004, ease: 'ease-in-out' },
                      { at: 5.2, value: 0.997, ease: 'ease-in-out' },
                      { at: 5.6, value: 1.003, ease: 'ease-in-out' },
                      { at: 6, value: 0.998, ease: 'ease-in-out' },
                      { at: 6.4, value: 1.004, ease: 'ease-in-out' },
                      { at: 6.8, value: 0.997, ease: 'ease-in-out' },
                      { at: 7.2, value: 1.003, ease: 'ease-in-out' },
                      { at: 7.6, value: 0.998, ease: 'ease-in-out' },
                      { at: 8, value: 1.004, ease: 'ease-in-out' },
                      { at: 8.4, value: 0.997, ease: 'ease-in-out' },
                      { at: 8.8, value: 1.003, ease: 'ease-in-out' },
                      { at: 9.2, value: 1, ease: 'ease-in-out' }
                    ] },
                    { target: 'head', property: 'x', keys: [
                      { at: 1.6, value: 160, ease: 'linear' },
                      { at: 4.5, value: 159.3, ease: 'ease-in' },
                      { at: 7.6, value: 158.4, ease: 'ease-in-out' },
                      { at: 9.2, value: 158.1, ease: 'ease-in-out' }
                    ] },
                    { target: 'head', property: 'y', keys: [
                      { at: 1.6, value: 65, ease: 'linear' },
                      { at: 4.5, value: 65.4, ease: 'ease-in' },
                      { at: 7.6, value: 66.1, ease: 'ease-in-out' },
                      { at: 9.2, value: 66.4, ease: 'ease-in-out' }
                    ] },
                    { target: 'head', property: 'rotate', keys: [
                      { at: 1.6, value: 0, ease: 'linear' },
                      { at: 4.5, value: -7, ease: 'ease-in' },
                      { at: 7.6, value: -14, ease: 'ease-in-out' },
                      { at: 9.2, value: -16, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_left', property: 'x', keys: [
                      { at: 1.6, value: 154.5, ease: 'linear' },
                      { at: 4.5, value: 153.5, ease: 'ease-in' },
                      { at: 7.6, value: 152.3, ease: 'ease-in-out' },
                      { at: 9.2, value: 152, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_left', property: 'y', keys: [
                      { at: 1.6, value: 62, ease: 'linear' },
                      { at: 4.5, value: 63.1, ease: 'ease-in' },
                      { at: 7.6, value: 64.5, ease: 'ease-in-out' },
                      { at: 9.2, value: 65, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_left', property: 'rotate', keys: [
                      { at: 1.6, value: 0, ease: 'linear' },
                      { at: 4.5, value: -7, ease: 'ease-in' },
                      { at: 7.6, value: -14, ease: 'ease-in-out' },
                      { at: 9.2, value: -16, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_right', property: 'x', keys: [
                      { at: 1.6, value: 165.5, ease: 'linear' },
                      { at: 4.5, value: 164.4, ease: 'ease-in' },
                      { at: 7.6, value: 163, ease: 'ease-in-out' },
                      { at: 9.2, value: 162.5, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_right', property: 'y', keys: [
                      { at: 1.6, value: 62, ease: 'linear' },
                      { at: 4.5, value: 61.8, ease: 'ease-in' },
                      { at: 7.6, value: 61.9, ease: 'ease-in-out' },
                      { at: 9.2, value: 62, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_right', property: 'rotate', keys: [
                      { at: 1.6, value: 0, ease: 'linear' },
                      { at: 4.5, value: -7, ease: 'ease-in' },
                      { at: 7.6, value: -14, ease: 'ease-in-out' },
                      { at: 9.2, value: -16, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_left', property: 'scale', keys: [
                      { at: 3.2, value: 1, ease: 'linear' },
                      { at: 4.7, value: 0.52, ease: 'ease-in' },
                      { at: 6.8, value: 0.52, ease: 'linear' },
                      { at: 8.6, value: 0.76, ease: 'ease-out' },
                      { at: 9.2, value: 0.7, ease: 'ease-in-out' }
                    ] },
                    { target: 'eye_right', property: 'scale', keys: [
                      { at: 3.4, value: 1, ease: 'linear' },
                      { at: 4.9, value: 0.58, ease: 'ease-in' },
                      { at: 7.2, value: 0.58, ease: 'linear' },
                      { at: 8.7, value: 0.72, ease: 'ease-out' },
                      { at: 9.2, value: 0.62, ease: 'ease-in-out' }
                    ] },
                    { target: 'mouth', property: 'x', keys: [
                      { at: 1.6, value: 160, ease: 'linear' },
                      { at: 4.5, value: 160.2, ease: 'ease-in' },
                      { at: 7.6, value: 160.1, ease: 'ease-in-out' },
                      { at: 9.2, value: 160, ease: 'ease-in-out' }
                    ] },
                    { target: 'mouth', property: 'y', keys: [
                      { at: 1.6, value: 72, ease: 'linear' },
                      { at: 4.5, value: 72.3, ease: 'ease-in' },
                      { at: 7.6, value: 72.9, ease: 'ease-in-out' },
                      { at: 9.2, value: 73.1, ease: 'ease-in-out' }
                    ] },
                    { target: 'mouth', property: 'rotate', keys: [
                      { at: 1.6, value: -4, ease: 'linear' },
                      { at: 4.5, value: -13, ease: 'ease-in' },
                      { at: 7.6, value: -22, ease: 'ease-in-out' },
                      { at: 9.2, value: -26, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_eye_left', property: 'x', keys: [
                      { at: 4.5, value: 151.5, ease: 'ease-in-out' },
                      { at: 7.6, value: 150.6, ease: 'ease-in-out' },
                      { at: 9.2, value: 150.3, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_eye_left', property: 'y', keys: [
                      { at: 4.5, value: 64.9, ease: 'ease-in' },
                      { at: 7.6, value: 68.5, ease: 'ease-in' },
                      { at: 9.2, value: 71.1, ease: 'ease-in' }
                    ] },
                    { target: 'blood_eye_left', property: 'rotate', keys: [
                      { at: 4.5, value: -7, ease: 'ease-in-out' },
                      { at: 7.6, value: -14, ease: 'ease-in-out' },
                      { at: 9.2, value: -16, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_eye_left', property: 'opacity', keys: [
                      { at: 3.4, value: 0, ease: 'ease-in' },
                      { at: 4.8, value: 0.18, ease: 'ease-in' },
                      { at: 7.2, value: 0.65, ease: 'ease-in' },
                      { at: 9.2, value: 0.9, ease: 'ease-in' }
                    ] },
                    { target: 'blood_eye_right', property: 'x', keys: [
                      { at: 4.5, value: 166.8, ease: 'ease-in-out' },
                      { at: 7.6, value: 165.5, ease: 'ease-in-out' },
                      { at: 9.2, value: 165.1, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_eye_right', property: 'y', keys: [
                      { at: 4.5, value: 63, ease: 'ease-in' },
                      { at: 7.6, value: 64.8, ease: 'ease-in' },
                      { at: 9.2, value: 66.8, ease: 'ease-in' }
                    ] },
                    { target: 'blood_eye_right', property: 'rotate', keys: [
                      { at: 4.5, value: -7, ease: 'ease-in-out' },
                      { at: 7.6, value: -14, ease: 'ease-in-out' },
                      { at: 9.2, value: -16, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_eye_right', property: 'opacity', keys: [
                      { at: 3.8, value: 0, ease: 'ease-in' },
                      { at: 5.2, value: 0.16, ease: 'ease-in' },
                      { at: 7.6, value: 0.58, ease: 'ease-in' },
                      { at: 9.2, value: 0.84, ease: 'ease-in' }
                    ] },
                    { target: 'blood_mouth_left', property: 'x', keys: [
                      { at: 4.5, value: 154, ease: 'ease-in-out' },
                      { at: 7.6, value: 153.9, ease: 'ease-in-out' },
                      { at: 9.2, value: 153.9, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_mouth_left', property: 'y', keys: [
                      { at: 4.5, value: 71.6, ease: 'ease-in' },
                      { at: 7.6, value: 74.4, ease: 'ease-in' },
                      { at: 9.2, value: 76.8, ease: 'ease-in' }
                    ] },
                    { target: 'blood_mouth_left', property: 'rotate', keys: [
                      { at: 4.5, value: -13, ease: 'ease-in-out' },
                      { at: 7.6, value: -22, ease: 'ease-in-out' },
                      { at: 9.2, value: -26, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_mouth_left', property: 'opacity', keys: [
                      { at: 4.4, value: 0, ease: 'ease-in' },
                      { at: 5.6, value: 0.22, ease: 'ease-in' },
                      { at: 7.8, value: 0.68, ease: 'ease-in' },
                      { at: 9.2, value: 0.88, ease: 'ease-in' }
                    ] },
                    { target: 'blood_mouth_right', property: 'x', keys: [
                      { at: 4.5, value: 166.8, ease: 'ease-in-out' },
                      { at: 7.6, value: 166.3, ease: 'ease-in-out' },
                      { at: 9.2, value: 166.1, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_mouth_right', property: 'y', keys: [
                      { at: 4.5, value: 69, ease: 'ease-in' },
                      { at: 7.6, value: 70.3, ease: 'ease-in' },
                      { at: 9.2, value: 72.3, ease: 'ease-in' }
                    ] },
                    { target: 'blood_mouth_right', property: 'rotate', keys: [
                      { at: 4.5, value: -13, ease: 'ease-in-out' },
                      { at: 7.6, value: -22, ease: 'ease-in-out' },
                      { at: 9.2, value: -26, ease: 'ease-in-out' }
                    ] },
                    { target: 'blood_mouth_right', property: 'opacity', keys: [
                      { at: 5, value: 0, ease: 'ease-in' },
                      { at: 6.1, value: 0.18, ease: 'ease-in' },
                      { at: 8.2, value: 0.55, ease: 'ease-in' },
                      { at: 9.2, value: 0.78, ease: 'ease-in' }
                    ] }
                  ]
                } },
              { dur: 4,
                text: '白光扫过黑沙滩,把潮池里的蓝火一枚枚点亮。',
                scene: { region: 'sea', mood: 'mystic', elements: [ { kind: 'item', ref: '蓝火潮池' } ] } },
              { hold: true,
                text: '光停在你脚边。选择下方出口，踏上沙滩开始调查。',
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
              { dur: 4,
                text: '守灯人抬起右手挥了两次，示意你靠近星镜。',
                cast: [{ id: 'warden', rig: {
                  parts: HUMANOID_FRONT_PARTS,
                  drawOrder: HUMANOID_FRONT_DRAW_ORDER,
                  tracks: HUMANOID_WAVE_TRACKS,
                  variants: HUMANOID_WAVE_VARIANTS,
                  secondary: HUMANOID_WAVE_SECONDARY
                } }] },
              { dur: 2.5,
                text: '守灯人与旅人一前一后站在星镜旁，镜光从两道剪影之间穿过。',
                cast: [
                  { id: 'warden', rig: makeStaticActorRig(108, '#85505a') },
                  { id: 'traveler', rig: makeStaticActorRig(212, '#41364d') }
                ] },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(104, '#85505a', [
                    { at: 0.12, value: 'A' }, { at: 0.32, value: 'O' },
                    { at: 0.56, value: 'A' }, { at: 0.82, value: 'rest' },
                    { at: 1.06, value: 'O' }, { at: 1.30, value: 'A' },
                    { at: 2.4, value: 'rest' }
                  ]) },
                  { id: 'traveler', rig: makeDialogueActorRig(216, '#41364d', []) }
                ],
                speaker: 'warden',
                text: { mode: 'typewriter', lines: [
                  { cps: 12, chunks: [{ text: '你终于来了。', pauseAfter: 0.24 }] }
                ] } },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(104, '#85505a', []) },
                  { id: 'traveler', rig: makeDialogueActorRig(216, '#41364d', [
                    { at: 0.12, value: 'O' }, { at: 0.34, value: 'A' },
                    { at: 0.60, value: 'O' }, { at: 0.86, value: 'rest' },
                    { at: 1.12, value: 'A' }, { at: 1.38, value: 'O' },
                    { at: 2.4, value: 'rest' }
                  ]) }
                ],
                speaker: 'traveler',
                text: { mode: 'typewriter', lines: [
                  { cps: 12, chunks: [{ text: '灯还亮着吗？', pauseAfter: 0.24 }] }
                ] } },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(104, '#85505a', [
                    { at: 0.12, value: 'A' }, { at: 0.36, value: 'O' },
                    { at: 0.64, value: 'A' }, { at: 0.94, value: 'rest' },
                    { at: 1.22, value: 'O' }, { at: 1.50, value: 'A' },
                    { at: 2.4, value: 'rest' }
                  ]) },
                  { id: 'traveler', rig: makeDialogueActorRig(216, '#41364d', []) }
                ],
                speaker: 'warden',
                text: { mode: 'typewriter', lines: [
                  { cps: 12, chunks: [{ text: '只要有人愿意守到天明。', pauseAfter: 0.24 }] }
                ] } },
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
