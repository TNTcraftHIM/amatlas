---
description: 构建当前 src/ 游戏并跑发布前三闸(改完 world.js 快速看效果;只做验证+重建,不碰叙事)
---

# /build —— 快速构建 + 自检

改完 `src/` 想立刻看效果时用这条。**在引擎根目录(解包出的 `amatlas/`)执行**,依次跑下面三步,**任一 P0≠0 就停下、把问题报给用户,别硬构建**:

1. `node core/tooling/graph-audit.mjs src/world.js` —— 结构审计,P0 必须 0(改剧情/门槛最易引入死链/死 flag)。
2. `node core/tooling/assembly-probe.mjs src/index.html` —— 装配探针,P0 必须 0。
3. `node pipeline/build/build.mjs src/index.html` —— 内联成单 HTML(过硬准入门)。当前环境能 `require.resolve('jsdom')` 时加 `--smoke` 补运行时烟雾。

三步全绿后,告诉用户**重开 `src/dist/index.html`** 看最新效果——改了源不重建,用户玩的还是旧版(实测高频坑:「改好了」但用户没看到任何变化)。

**只做机械的「验证 + 重建」**:canon / 路径前提 / 角色连续性 / 重访出戏 / 平衡这些叙事层检查是 `/audit-game`、`/polish-game`、`/revisit-check`、`/balance-check` 的活,`/build` 不碰——保持它高频、快、可预测(每次固定跑这三条,不即兴、不漏跑)。
