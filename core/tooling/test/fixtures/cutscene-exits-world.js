// R2 二轮 P0 fixture:kind:'cutscene' 节点误用 exits 声明出口(应写 links)。
//   引擎首次进入该节点即抛(cutscene parseBeats fail-loud),但 assembly-probe/smoke 贪心只走首分支、
//   常测不到 → 坏成品过四闸、上线后玩家点该分支才崩。graph-audit 静态牙应把它提前报 [确认][P0]。
//   兄弟对照:examples/tabletop 用 exits 移动是对的,唯 cutscene 出口必须走 links。
module.exports = {
  id: '50505050-5050-4050-8050-505050505050',
  start: { map: 'm', node: 'a' },
  maps: {
    m: {
      nodes: {
        a: { kind: 'scene', body: ['入口'], links: [{ to: 'safe', label: '安全出口' }, { to: 'bad', label: '过场出口' }] },
        safe: { kind: 'scene', body: ['安全结局'], links: [{ to: 'a', label: '返回' }] },
        bad: { kind: 'cutscene', beats: [{ dur: 1, text: '过场演出' }], exits: [{ to: 'after', label: '继续' }] },
        after: { kind: 'scene', body: ['过场后'], links: [{ to: 'a', label: '返回' }] }
      }
    }
  }
};
