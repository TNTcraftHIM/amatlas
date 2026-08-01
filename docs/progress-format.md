# 作品进度 current 格式

`PROGRESS.md` 位于作品工作区根目录，只记录跨 checkpoint、compact、停工或下一会话时恢复工作所需的短 current。时间线、角色状态、世界规则、flag 语义和伏笔等耐久事实写入根 `canon.md`；翻译术语写入根 `glossary.md`。

短期原型如果不会跨过上述边界，可以暂不创建 `PROGRESS.md`。一旦需要交接，创建或替换下面唯一的 marker 块：

```markdown
<!-- AMATLAS:PROGRESS:START -->
- 目标: <本阶段一个目标>
- 当前: <当前动作与相关路径，或“无”>
- 下一步: <唯一、可直接执行的动作>
- 待验证: <未完成命令/人工检查，或“无”>
- 约束/用户门: <待确认的覆盖/公开/不可逆动作，或“无”>
<!-- AMATLAS:PROGRESS:END -->
```

这些字段是写作建议，不是固定 schema。可以重排、补充说明或省略不适用项；正文由 hook 当作 opaque Markdown 运输，不猜测字段语义。

## 机械边界

- START 与 END 必须各自唯一、独占整行，并按 START 在前、END 在后的顺序出现。
- marker 内正文必须非空，最多 5600 个 UTF-16 code unit（JavaScript 字符串的 `.length` 单位；一个 emoji 通常占 2）；不限制行数。
- 根 `PROGRESS.md` 必须是项目树内的普通文件，整文件最多 64 KiB；目录、symlink、其它非普通文件与超限文件只报告状态，正文不会被 hook 读取或运输。
- 合法 current 会完整运输，不能依靠 hook 截头或截尾；需要缩短时应由作者明确改写。
- marker 外正文不会被 SessionStart 注入，也不会被 PreCompact 复制到恢复快照。

每完成一个可恢复的小步，或准备 compact、停工、换会话时，直接替换 marker 内 current。不要在 marker 内累积历史；已稳定的世界事实转入 `canon.md`，已完成且不再影响恢复的过程信息删除即可。

## Legacy 与损坏文件

完全没有 marker 的 `PROGRESS.md` 是 legacy。Hook 不会注入、复制或自动迁移其正文，只会报告路径和大小。编辑 legacy 前必须显式完整读取文件；迁移应另立任务并获得授权，先保留可核对的原文件备份，再把耐久事实整理到 `canon.md`，最后按本页模板建立 current。不要根据尾部片段猜测旧状态。

marker 重复、缺失、错序、正文为空或超过 5600 UTF-16 code unit 时，文件是 invalid；先完整读取并修复结构，不要把它当作 legacy 降级处理。普通文件整体验收在正文解析前完成：超过 64 KiB 是 oversized，目录或其它非普通入口是 non_regular，指向树外的 symlink 是 tree_external；这些状态均为零正文。其它 I/O 错误是 unreadable；先解决文件系统问题，hook 不会创建、覆盖或修复它。

## Hook 恢复事实

- SessionStart 每次解析根 `PROGRESS.md`。`valid` 会完整注入 current，即使阶段 1 的设计 checkpoint 先于 world 创建；legacy、invalid 与 unreadable 仍只给诊断，正文不注入。无 world 且无 current 时保持中立，不猜游戏类型。
- PreCompact 每次原子替换 `.claude/last-precompact.txt`，记录本次 trigger、会话/转录路径、world（可为 `none`）、进度状态、根 `canon.md` 状态和有界 Git 状态；只有 `valid` 会复制 current，包括 pre-world checkpoint。它是本次 compact 的恢复快照，不替代 current 或 canon。
