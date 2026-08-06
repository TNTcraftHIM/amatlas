/* fixture:健康 cutscene 世界(cutscene v42 正向闸夹具)
   —— intro(cutscene,links 是结构出口)→ hall(scene)→ outro(cutscene 结局,无出口)。
   期望:P0=0、退出码 0;outro 只报 P2 死胡同(有意结局);links 是一等出边 → outro 可达。 */
const W = {
  id: '272ebf5c-dc86-4d75-8ee1-d75455623623',
  start: { map: 'm', node: 'intro' },
  maps: { m: { name: '夹具', nodes: {
    intro: { kind: 'cutscene', title: '序章',
      beats: [
        { dur: 2, text: '黑幕。', scene: { region: 'night', mood: 'tense', elements: [{ kind: 'letterbox' }] }, audio: { music: 'elegy' } },
        { dur: 3, text: '雨没有停过。', run: function (S) { S.flags.intro_seen = true; } },
        { hold: true, text: '——按下继续。' }
      ],
      links: [{ to: 'hall', label: '进入游戏' }] },
    hall: { kind: 'scene', look: '大厅。', links: [{ to: 'outro', label: '走向结局' }] },
    outro: { kind: 'cutscene', title: '终章',
      beats: [{ dur: 2, text: '故事结束了。' }, { hold: true, text: '(完)' }],
      links: [] }
  } } }
};
if (typeof module !== 'undefined' && module.exports) module.exports = W;
