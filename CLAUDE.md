@AGENTS.md

# Claude Code 补充指引

## Commands 与 skill

七个 Claude command 是 `/new-game`、`/audit-game`、`/build`、`/polish-game`、`/translate-game`、`/revisit-check`、`/balance-check`。`.claude/commands/` 文件拥有参数解析与 command 专属安全门；不得旁路，也不得创建同名 skill。

文字冒险调用 `.claude/skills/text-adventure-game/SKILL.md`，只读取该 skill 为当前任务路由的 references。Command、skill、正式 example 与 reference 各守自己的信息所有权。

## Hooks

- `SessionStart` 解析根 `PROGRESS.md`：合法 current 即使先于 world 创建也会完整注入，支持设计 checkpoint；legacy、损坏或不可读文件始终只给诊断。Git 状态独立有界，不能挤掉 current。
- `Stop` 运行 `graph-audit.mjs` 与 `assembly-probe.mjs`，确认的 P0 会阻止结束；jsdom smoke 仅在已安装时作为可选增强，失败类别以工具真实输出为准。
- `PreCompact` 每次原子替换 `.claude/last-precompact.txt`，包括 `world:none`；只有合法 current 会复制进本次快照。写入失败会报非阻断 compact 的 hook error，并保留旧目标字节；快照不能替代 `PROGRESS.md` 与 `canon.md`。
- Core 保护 hook 只是额外的编辑守卫，不能被理解为允许通过其它写路径绕过 `AGENTS.md` 的 core 边界。

## Compact 恢复

current 的维护时机与格式只看 `docs/progress-format.md`。compact 后先核对 `SessionStart` 注入，仅在需要时读取本次 `.claude/last-precompact.txt`，重新加载相关 skill/references 后继续。
