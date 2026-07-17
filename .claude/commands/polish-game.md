---
description: 精修已完成的游戏(文案/平衡/视觉/音乐/成就/分支——对话点单式修改,改完自动重验重建)
argument-hint: [想改什么,留空则先给精修菜单]
---

精修现有游戏。用户要求:$ARGUMENTS

## 第一步:读现状(别凭记忆改)
读 `src/world.js` + `src/game.js` + `src/index.html`,扫一遍游戏现状(几图几节点/用了哪些
audio·scene 词汇/成就几条/检定几处)。**若用户没说改什么**,按下表报一份「可精修面菜单」让用户点单;
说了就直接对号入座。

## 精修菜单(每项:改哪里 → 改完验什么)
| 想精修什么 | 改哪里 | 参考 |
|---|---|---|
| **文案润色**(look 干瘪/对话没味) | `world.js` 的 `look`/`run` 返回文本(注意每屏 100-200 词节奏) | SKILL 写作铁律、canon.md 防跑 |
| **平衡**(太难/太easy/刷点) | `world.js` 的 dc/cost/资源初值/门槛数值 | `/balance-check`;tabletop-design §5 DC 速查 |
| **视觉换肤**(配色/场景/物件) | 普通 UI skin 只改 `index.html` 的 `data-ui` 或 `--amatlas-*` token(见 `references/ui-skins.md`);场景意图改节点 `scene:{region,mood,elements,art}`;只有改变 SVG 画法、音色合成、region/mood 映射时才改 presenter | ui-skins.md;game-design-guide §1/§5;visual-system.md |
| **音乐/声景**(气质不对/太单一) | 节点 `audio:{music,ambient}` 换预设(music 22 / ambient 13)/ `{preset,…微调}` / timbre 板 / `{midi}` 嵌现成曲 | audio-system.md 选乐速查表 |
| **成就**(没描述/太少/想加隐藏) | `game.js` manifest 的 `achievements[]`(description 务必写;hidden 防剧透;跨 reset 持久) | new-game 模板注释 |
| **加深分支**(选择没后果感) | delayed branching:选择写 flag → 后章 look/出口按 flag 回写与分化;每章至少一句 callback | story-adaptation.md §3 |
| **地图/存档等控件** | `game.js` manifest(minimap 布局/save 槽数);游戏身份/默认存档 namespace 看 `world.js` 的稳定 UUID v4 `id`（`saveKey` 仅嵌入/迁移 override） | player-map.md |
| **新玩法**(加检定/自定义机制) | 加 `kind:'encounter'` 节点 + manifest.sheet;再大就新模块 | tabletop-design;plugin-development.md |

修改纪律照 SKILL「修改分层」:内容/数值→world.js,外观→:root 变量或 presenter 映射,玩法→模块;
**不碰 `core/runtime/engine-core.js`**。

## 第三步:改完铁律(每轮修改收尾必做,不是可选;以下命令均在**引擎根目录**(解包出的 amatlas/)执行)
1. `node core/tooling/graph-audit.mjs src/world.js` —— P0 必须 0(改剧情/门槛最容易引入死链/死 flag)。
2. `node core/tooling/assembly-probe.mjs src/index.html` —— P0 必须 0。
3. **重建**:`node pipeline/build/build.mjs src/index.html` → 告诉用户**重开 `src/dist/index.html`**。
   改了源不重建 = 用户玩的还是旧版(实测高频坑——"改好了"但用户没看到任何变化)。
4. 大改剧情后跑 `/revisit-check`(重访文本一致性);动数值后跑 `/balance-check`。
5. 一句话总结改了什么、动了哪些文件——别让用户猜。

多轮精修就重复「点单 → 改 → 铁律收尾」;每轮都收尾,别攒一堆改动最后一起验。
