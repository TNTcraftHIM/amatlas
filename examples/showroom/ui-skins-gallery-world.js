/* Amatlas Showroom · UI Skin Gallery 世界数据
   这不是 playable demo,而是给作者/AI 比较普通页面 UI chrome 的 Gallery/Preview。
   仍导出真实 {start,maps} world,让 graph-audit / build gate 像检查普通游戏一样检查它。 */
(function (global, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else global.UI_SKINS_GALLERY_WORLD = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    id: '69fc6d91-a0eb-42f2-8f7b-d88e2ffe8932',
    start: { map: 'gallery', node: 'foyer' },
    seed: 20260705,
    initState: { inventory: [] },
    maps: {
      gallery: {
        name: 'UI Skin Gallery',
        nodes: {
          foyer: {
            kind: 'scene',
            name: '普通页面基线',
            map: { x: 18, y: 74 },
            scene: {
              region: 'forest',
              mood: 'calm',
              elements: [
                { kind: 'item', ref: '选择按钮' },
                { kind: 'character', ref: '作者' }
              ]
            },
            look: function (S, first) {
              var unlocked = S.flags && S.flags.sampleRead;
              return (first
                ? '这是同一套普通文字冒险 DOM:标题、正文、场景图、选择按钮、状态栏和插件工具栏。'
                : '你仍在同一页普通游戏里,改变的只是 html[data-ui] 对应的 CSS。')
                + '\n切换上方 skin 按钮时,世界数据、模块和 View 契约都不会变化。'
                + (unlocked ? '\n你已经读过样张说明,锁定选项被同一套规则解开。' : '');
            },
            events: [
              { id: 'gallery-note', once: true, run: function (S) {
                S.flags.galleryOpened = true;
                return 'Gallery 提示:这些皮肤是可复制的 HTML/CSS 模板层能力,不是新模块。';
              } }
            ],
            links: [
              { id: 'read-sample', label: '阅读界面样张说明', once: true,
                run: function (S) {
                  S.flags.sampleRead = true;
                  if (S.inventory.indexOf('样张说明') < 0) S.inventory.push('样张说明');
                  return '样张说明写得很清楚:skin 只改 chrome,不改地图、状态机和剧情数据。';
                } },
              { to: 'archive', label: '查看档案式页面' },
              { to: 'terminal', label: '查看终端式页面' },
              { to: 'case', label: '打开锁定的证据页', showWhenLocked: true,
                requires: function (S) { return !!(S.flags && S.flags.sampleRead); },
                lockHint: '先阅读样张说明' }
            ]
          },

          archive: {
            kind: 'scene',
            name: '书页与档案',
            map: { x: 46, y: 48 },
            scene: {
              region: 'library',
              mood: 'calm',
              elements: [
                { kind: 'item', ref: '羊皮纸' },
                { kind: 'item', ref: '标签栏' }
              ]
            },
            look: '这页用来观察长段正文、事件行和移动按钮在暖色纸面或档案风格里是否仍然清楚。\n好的 skin 应该强化题材气质,但不能牺牲阅读和可点击性。',
            links: [
              { to: 'foyer', label: '回到普通页面基线' },
              { to: 'case', label: '跳到证据页', showWhenLocked: true,
                requires: function (S) { return !!(S.flags && S.flags.sampleRead); },
                lockHint: '先阅读样张说明' }
            ]
          },

          terminal: {
            kind: 'scene',
            name: '终端输出',
            map: { x: 70, y: 68 },
            scene: {
              region: 'night',
              mood: 'tense',
              elements: [
                { kind: 'hazard', ref: '告警' },
                { kind: 'item', ref: '日志' }
              ]
            },
            look: '终端 skin 会把同一批 DOM 钩子改成等宽字体、细线框和高对比强调色。\n注意:它可以有轻微扫描线,但在 reduced-motion 下不能依赖强动画。',
            links: [
              { to: 'foyer', label: '回到普通页面基线' },
              { to: 'archive', label: '换回书页观察' }
            ]
          },

          case: {
            kind: 'scene',
            name: '证据页',
            map: { x: 84, y: 28 },
            scene: {
              region: 'city',
              mood: 'mystery',
              elements: [
                { kind: 'item', ref: '证据 A' },
                { kind: 'character', ref: '目击者' }
              ]
            },
            look: '锁定选项已经解开。这里用于检查 disabled 按钮、lock-hint、状态栏、插件面板和小地图标签在不同 skin 下是否仍然可读。',
            links: [
              { to: 'foyer', label: '回到普通页面基线' },
              { to: 'terminal', label: '查看终端式页面' }
            ]
          }
        }
      }
    }
  };
});
