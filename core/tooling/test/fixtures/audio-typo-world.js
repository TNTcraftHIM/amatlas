/* 夹具:audio 预设名 typo(易用性审计批 + C16)——ambient:'ocean'(应 waves)+ music:'clam'(应 calm,字符串路径)
   + c 节点 music:{preset:'tenze'}(对象路径 typo,C16)。ambient 未知名真机每次渲染 fail-loud 抛(探针/烟雾无 Web Audio
   测不到);music 未知名(字符串/对象)运行时回退默认曲。graph-audit 应各报一条 P1(名单从呈现器源码解析);b/d(d 含带连字符的合法名 jazz-noir/ambient-unease)全对照=不误报。 */
module.exports = {
  id: '89d0f895-c159-4410-98a4-7dd77c0d94a6',
  start: { map: 'm', node: 'a' },
  maps: { m: { name: '试音', nodes: {
    a: { kind: 'scene', look: '海边(写错预设名)', audio: { music: 'clam', ambient: 'ocean' },
      links: [{ to: 'b', label: '走' }, { to: 'c', label: '去 c' }, { to: 'd', label: '去 d' }] },
    b: { kind: 'scene', look: '海边(正确预设名)', audio: { music: 'calm', ambient: 'waves' },
      links: [{ to: 'a', label: '回' }] },
    c: { kind: 'scene', look: '对象形写错预设名', audio: { music: { preset: 'tenze', tempo: 90 } },
      links: [{ to: 'a', label: '回' }] },
    d: { kind: 'scene', look: '带连字符的合法预设名(jazz-noir / ambient-unease)', audio: { music: 'jazz-noir', ambient: 'ambient-unease' },
      links: [{ to: 'a', label: '回' }] }
  } } }
};
