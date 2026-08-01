/* Amatlas expressiveness showcase: one self-contained, linear cutscene. */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.RIG_SHOWCASE_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

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

  function cloneArt(art) {
    return art.map(function (primitive) {
      var copy = {};
      Object.keys(primitive).forEach(function (key) { copy[key] = primitive[key]; });
      return copy;
    });
  }

  function makeActorParts(rootX, bodyFill) {
    return HUMANOID_FRONT_PARTS.map(function (part) {
      var art = cloneArt(part.art);
      var rest = {
        x: part.rest.x,
        y: part.rest.y,
        rotate: part.rest.rotate,
        scaleX: part.rest.scaleX,
        scaleY: part.rest.scaleY,
        opacity: part.rest.opacity
      };

      if (part.id === 'torso') {
        art[0].fill = bodyFill;
        rest.x = rootX;
        rest.y = 108;
        rest.scaleX = 0.82;
        rest.scaleY = 0.82;
      }

      return {
        id: part.id,
        parent: part.parent,
        art: art,
        pivot: { x: part.pivot.x, y: part.pivot.y },
        rest: rest
      };
    });
  }

  function makeWalkAndPointRig(rootX, bodyFill, seed) {
    var end = 4.2;
    return {
      parts: makeActorParts(rootX, bodyFill),
      drawOrder: HUMANOID_FRONT_DRAW_ORDER.slice(),
      tracks: [
        { target: 'torso', property: 'x', keys: [
          { at: 0.7, value: rootX + 14, ease: 'ease-in-out' },
          { at: 1.4, value: rootX + 28, ease: 'ease-in-out' },
          { at: 2.1, value: rootX + 42, ease: 'ease-in-out' },
          { at: 2.8, value: rootX + 56, ease: 'ease-out' },
          { at: end, value: rootX + 56, ease: 'linear' }
        ] },
        { target: 'torso', property: 'y', keys: [
          { at: 0.35, value: 106, ease: 'ease-out' },
          { at: 0.7, value: 108, ease: 'ease-in' },
          { at: 1.05, value: 106, ease: 'ease-out' },
          { at: 1.4, value: 108, ease: 'ease-in' },
          { at: 1.75, value: 106, ease: 'ease-out' },
          { at: 2.1, value: 108, ease: 'ease-in' },
          { at: 2.45, value: 106, ease: 'ease-out' },
          { at: 2.8, value: 108, ease: 'ease-in' },
          { at: end, value: 108, ease: 'linear' }
        ] },
        { target: 'leg_l', property: 'rotate', keys: [
          { at: 0.35, value: -20, ease: 'ease-out' },
          { at: 1.05, value: 20, ease: 'ease-in-out' },
          { at: 1.75, value: -20, ease: 'ease-in-out' },
          { at: 2.45, value: 20, ease: 'ease-in-out' },
          { at: 2.8, value: 2, ease: 'ease-out' },
          { at: end, value: 2, ease: 'linear' }
        ] },
        { target: 'leg_r', property: 'rotate', keys: [
          { at: 0.35, value: 20, ease: 'ease-out' },
          { at: 1.05, value: -20, ease: 'ease-in-out' },
          { at: 1.75, value: 20, ease: 'ease-in-out' },
          { at: 2.45, value: -20, ease: 'ease-in-out' },
          { at: 2.8, value: -2, ease: 'ease-out' },
          { at: end, value: -2, ease: 'linear' }
        ] },
        { target: 'arm_l_upper', property: 'rotate', keys: [
          { at: 0.35, value: 28, ease: 'ease-out' },
          { at: 1.05, value: -8, ease: 'ease-in-out' },
          { at: 1.75, value: 28, ease: 'ease-in-out' },
          { at: 2.45, value: -8, ease: 'ease-in-out' },
          { at: 2.8, value: 12, ease: 'ease-out' },
          { at: end, value: 12, ease: 'linear' }
        ] },
        { target: 'arm_r_upper', property: 'rotate', keys: [
          { at: 0.35, value: -28, ease: 'ease-out' },
          { at: 1.05, value: 8, ease: 'ease-in-out' },
          { at: 1.75, value: -28, ease: 'ease-in-out' },
          { at: 2.45, value: 8, ease: 'ease-in-out' },
          { at: 3.35, value: -96, ease: 'ease-in-out' },
          { at: end, value: -96, ease: 'linear' }
        ] },
        { target: 'arm_r_fore', property: 'rotate', keys: [
          { at: 2.8, value: 4, ease: 'linear' },
          { at: 3.35, value: 4, ease: 'ease-out' },
          { at: end, value: 4, ease: 'linear' }
        ] },
        { target: 'hand_r', property: 'rotate', keys: [
          { at: 2.8, value: 0, ease: 'linear' },
          { at: 3.35, value: -8, ease: 'ease-out' },
          { at: end, value: -8, ease: 'linear' }
        ] },
        { target: 'head', property: 'rotate', keys: [
          { at: 2.8, value: 0, ease: 'linear' },
          { at: 3.35, value: -8, ease: 'ease-out' },
          { at: end, value: -8, ease: 'linear' }
        ] }
      ],
      variants: [],
      secondary: [
        { type: 'follow', source: { target: 'head', property: 'rotate' },
          target: 'hair_tip', property: 'rotate', delayMs: 90, gain: 0.5, min: -6, max: 6 },
        { type: 'oscillate', target: 'torso', property: 'scaleY',
          periodMs: 2100, amplitude: 0.012, phase: 0.15 },
        { type: 'blink', target: 'eyes', property: 'scaleY', closedValue: 0.08,
          windowMs: 1800, durationMs: 100, chance: 0.65, seed: seed }
      ]
    };
  }

  function makeDialogueActorRig(rootX, bodyFill, mouthKeys, seed) {
    return {
      parts: makeActorParts(rootX, bodyFill),
      drawOrder: HUMANOID_FRONT_DRAW_ORDER.slice(),
      tracks: [
        { target: 'head', property: 'rotate', keys: [
          { at: 0.55, value: -3, ease: 'ease-out' },
          { at: 1.1, value: 2, ease: 'ease-in-out' },
          { at: 2.4, value: 0, ease: 'ease-in-out' }
        ] }
      ],
      variants: [
        { target: 'mouth', base: 'rest', states: [
          { id: 'A', art: [
            { shape: 'ellipse', cx: 0, cy: 6, rx: 4, ry: 3.2, fill: '#681f32' }
          ] },
          { id: 'O', art: [
            { shape: 'ellipse', cx: 0, cy: 6, rx: 2.7, ry: 3.7, fill: 'none', stroke: '#681f32', sw: 1.2 }
          ] }
        ], keys: mouthKeys }
      ],
      secondary: [
        { type: 'follow', source: { target: 'head', property: 'rotate' },
          target: 'hair_tip', property: 'rotate', delayMs: 90, gain: 0.5, min: -6, max: 6 },
        { type: 'oscillate', target: 'torso', property: 'scaleY',
          periodMs: 2100, amplitude: 0.012, phase: 0.15 },
        { type: 'blink', target: 'eyes', property: 'scaleY', closedValue: 0.08,
          windowMs: 1800, durationMs: 100, chance: 0.65, seed: seed }
      ]
    };
  }

  return {
    id: '7b64aa9c-54ec-4f55-9bcf-42a220a6d8c1',
    start: { map: 'showcase', node: 'main' },
    seed: 20260720,
    maps: {
      showcase: {
        name: '表现力展示',
        nodes: {
          main: {
            kind: 'cutscene',
            title: 'Amatlas 表现力展示',
            beats: [
              { dur: 4,
                text: 'FK 剪纸角色:挥手·眨眼·呼吸·表情',
                scene: { region: 'night', mood: 'mystic', transition: 'fade' },
                audio: { music: 'elegy', ambient: 'waves' },
                cast: [{ id: 'actor', rig: {
                  parts: HUMANOID_FRONT_PARTS,
                  drawOrder: HUMANOID_FRONT_DRAW_ORDER,
                  tracks: HUMANOID_WAVE_TRACKS,
                  variants: HUMANOID_WAVE_VARIANTS,
                  secondary: HUMANOID_WAVE_SECONDARY
                } }] },
              { dur: 2,
                text: '扁平岩块落地:下坠、触地受力并回弹归位。',
                motion: {
                  layers: [
                    { id: 'landing_rock', art: 'rock', x: 160, y: 38, scale: 0.9, rotate: -3, opacity: 1 }
                  ],
                  tracks: [
                    { target: 'landing_rock', property: 'y', keys: [
                      { at: 0.42, value: 88, ease: 'ease-in' },
                      { at: 0.56, value: 108, ease: 'ease-in' },
                      { at: 0.76, value: 100, ease: 'ease-out' },
                      { at: 1.08, value: 108, ease: 'ease-out' }
                    ] },
                    { target: 'landing_rock', property: 'scaleX', keys: [
                      { at: 0.42, value: 0.78, ease: 'ease-in' },
                      { at: 0.56, value: 1.16, ease: 'ease-out' },
                      { at: 0.76, value: 0.86, ease: 'ease-out' },
                      { at: 1.08, value: 0.9, ease: 'ease-out' }
                    ] },
                    { target: 'landing_rock', property: 'scaleY', keys: [
                      { at: 0.42, value: 1.08, ease: 'ease-in' },
                      { at: 0.56, value: 0.66, ease: 'ease-out' },
                      { at: 0.76, value: 0.98, ease: 'ease-out' },
                      { at: 1.08, value: 0.9, ease: 'ease-out' }
                    ] }
                  ]
                } },
              { dur: 3.4,
                text: { mode: 'typewriter', lines: [
                  { cps: 11, chunks: [
                    { text: '打字机逐字:', pauseAfter: 0.45 },
                    { text: '文字按节奏出现,', cps: 13, pauseAfter: 0.35 },
                    { text: '停顿也由数据定义。', cps: 10 }
                  ] }
                ] } },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(104, '#85505a', [
                    { at: 0.12, value: 'A' }, { at: 0.32, value: 'O' },
                    { at: 0.56, value: 'A' }, { at: 0.82, value: 'rest' },
                    { at: 1.06, value: 'O' }, { at: 1.30, value: 'A' },
                    { at: 2.4, value: 'rest' }
                  ], 324508639) },
                  { id: 'traveler', stage: { facing: 'mirror-x',
                    enter: { offset: { x: 64, y: 0 }, dur: 0.6, ease: 'ease-out' } },
                    rig: makeDialogueActorRig(216, '#3f5962', [], 610839776) }
                ],
                speaker: 'warden',
                text: { mode: 'typewriter', lines: [
                  { cps: 12, chunks: [{ text: '守灯人:你终于来了。', pauseAfter: 0.24 }] }
                ] } },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(104, '#85505a', [], 324508639) },
                  { id: 'traveler', stage: { facing: 'mirror-x' }, rig: makeDialogueActorRig(216, '#3f5962', [
                    { at: 0.12, value: 'O' }, { at: 0.34, value: 'A' },
                    { at: 0.60, value: 'O' }, { at: 0.86, value: 'rest' },
                    { at: 1.12, value: 'A' }, { at: 1.38, value: 'O' },
                    { at: 2.4, value: 'rest' }
                  ], 610839776) }
                ],
                speaker: 'traveler',
                text: { mode: 'typewriter', lines: [
                  { cps: 12, chunks: [{ text: '旅人:灯还亮着吗?', pauseAfter: 0.24 }] }
                ] } },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(104, '#85505a', [
                    { at: 0.12, value: 'A' }, { at: 0.36, value: 'O' },
                    { at: 0.64, value: 'A' }, { at: 0.94, value: 'rest' },
                    { at: 1.22, value: 'O' }, { at: 1.50, value: 'A' },
                    { at: 2.4, value: 'rest' }
                  ], 324508639) },
                  { id: 'traveler', stage: { facing: 'mirror-x',
                    exit: { offset: { x: 64, y: 0 }, dur: 0.6, ease: 'ease-in' } },
                    rig: makeDialogueActorRig(216, '#3f5962', [], 610839776) }
                ],
                speaker: 'warden',
                text: { mode: 'typewriter', lines: [
                  { cps: 12, chunks: [{ text: '守灯人:只要有人愿意守到天明。', pauseAfter: 0.24 }] }
                ] } },
              { dur: 4.2,
                cast: [
                  { id: 'warden', rig: makeWalkAndPointRig(104, '#85505a', 324508639) }
                ],
                text: '旅人离开后，守灯人走向窗边，抬手指向第一线晨光。' },
              { dur: 2.4,
                cast: [
                  { id: 'warden', rig: makeDialogueActorRig(160, '#85505a', [], 324508639) }
                ],
                text: '旅人已离开，只剩守灯人站在晨光前。' }
            ],
            links: [
              { to: 'main', label: '重看完整展示' }
            ]
          }
        }
      }
    }
  };
});
