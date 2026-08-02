# Amatlas 创作入口

把本目录当作独立的游戏创作工作区。顶层只保留工具中立边界；详细方法按任务从 skill、正式 example 与 reference 加载。

> **0.x 测试版本**：稳定生命周期前公共契约可能变化；破坏性历史看 `CHANGELOG.md`，不要在这里复制活版本号。

## 工作边界

- 游戏只写在根 `src/` 工位：`src/world.js` 保存世界数据，`src/game.js` 调用 `window.Amatlas.boot(...)`，`src/index.html` 提供页面、样式与有序脚本。
- `src/world.js` 已存在即代表现有作品；未经明确确认，不得覆盖、删除、归档或替换。
- `examples/` 是只读教材，不得直接修改、审计或重建 demo 来代替原创产物。确认创建文字冒险后，把正式范例三个源文件复制到 `src/`，再只改工位文件。
- 内容归 `src/world.js`，装配归 `src/game.js`，表现意图归 presenter 或本作样式。做游戏时 core 不碰：不得修改 `core/runtime/engine-core.js`。
- 跨 checkpoint、compact、停工或下一会话时，按 `docs/progress-format.md` 替换维护 `PROGRESS.md` 的 current。

## 类型路由

- `scene`：从 `examples/text-adventure-demo/` 起步，调用 `text-adventure-game` skill 能力，并只加载该能力为当前任务路由的 `references/`。
- `encounter`：使用 `examples/tabletop-demo/` 与 `modules/tabletop/references/tabletop-design.md`。
- `cutscene`：使用 `examples/cutscene-demo/` 与 `modules/cutscene/references/cutscene-authoring.md`。`CutsceneAuthoring.compilePerformance` 是常规语义入口；低层 beats 是专家 escape hatch。正式装配顺序见该 reference。
- `maze3d` 私有 runtime：第一人称 FPS 从 `examples/maze3d/` 的 `fps-range` 与 `examples/maze3d/references/maze3d-authoring.md` 起步；它是放入 `manifest.modules` 的自定义 runtime，不是 boot 内建 kind，也不要误判成引擎没有的玩法。`precision`、`scatter`、`loadout`、`equipped`、`pickups` 与 `maze.theme` 细节只看 reference。
- 真正的新 kind：从 `modules/minimal/` 与 skill 的 `references/plugin-development.md` 起步。

正式 examples 拥有可执行模板，skills 拥有工作流与类型策略，references 拥有能力细节。入口只链接这些真相源，不复制教程或清单。

## 必跑闸

相关改动后，对 `src/` 工位运行并修复所有非零结果：

- `node core/tooling/graph-audit.mjs src/world.js`
- `node core/tooling/assembly-probe.mjs src/index.html`
- `node pipeline/build/build.mjs src/index.html`

修改共享引擎行为时再跑 `node test/run.cjs`。可选或人工验证必须如实报告；没有真实执行就不能声称浏览器验收通过。

## 授权门

请求范围内的可逆创作选择可自主推进。覆盖或删除现有作品必须明确确认；公开部署/发布、付费、凭据操作及其它难以撤销的动作必须先获明确授权。
