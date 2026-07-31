# 生成物 — 勿手改

本目录由 `core/tooling/codex-parity.mjs --sync` 从 `.claude/skills/` 生成,
是 Codex CLI 原生扫描的 `.agents/skills/` 镜像(Codex 从 cwd 向上遍历只认这个路径)。

真相源在 `.claude/skills/`——改 skill 内容去改源,再跑 `--sync` 重生成本目录。
手改本目录下的文件会在下次 `--sync` 时被覆盖,`--check` 也会把手改判为漂移。

设计依据: docs/codex-parity-design.md。
