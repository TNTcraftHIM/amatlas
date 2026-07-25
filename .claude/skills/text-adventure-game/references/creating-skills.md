# 创建你自己的 skill(让引擎越用越顺手)

> 本指引**通用**(不限文字冒险):做完任何一个游戏后都适用。

做完一个游戏,你会积累一些**值得复用**的东西:风格偏好、设计模式、叙事约定、工作流习惯。
这些经验若只留在对话里,会随上下文压缩(compact)丢失;下次做新游戏又得从零开始。
**把它固化成一个 skill**,Claude Code 下次会**自动发现并加载**——经验就累积下来、越用越顺。

## 机制:Claude Code 自动发现 `.claude/skills/`
- 在项目里建 `.claude/skills/<你的名字>/SKILL.md`,Claude Code 启动时**自动发现**(无需任何注册)。
- SKILL.md 顶部的 frontmatter `description` 决定 Claude **何时**加载它(写清"做什么题材/什么场景时用")。
- 加载后,SKILL.md 正文 + 同目录 `references/` 都进入 Claude 的上下文。

## 什么时候创建(别制造噪声)
- 你发现自己**重复**给 Claude 同样的指示(> 2 次)→ 该固化成 skill。
- 一个项目里形成了稳定的**风格 / 约定 / 流程**,你希望下个项目延续。
- **不要**给每个一次性细节都建 skill;只固化**会复用**的模式(否则 skill 库变噪声,反而干扰判断)。

## 写什么(举例)
- **风格偏好**:「我的恐怖游戏总是用 `mood:'dread'` 开头,转折点升到 `'horror-climax'`」
- **设计模式**:「检定 DC 用 6 / 8 / 10 / 12 四档,不用奇数」
- **叙事约定**:「对话用「」不用引号;每个场景至少两个感官描写」
- **工作流偏好**:「先写全部节点的 `look`,再补 `scene`/`audio`,最后补 `actions`」

## 最小模板(复制即用)
```markdown
---
name: my-horror-style
description: 我的恐怖游戏风格偏好(mood 曲线 / 音色 / 节奏)。做恐怖或惊悚题材时加载。
---
# 我的恐怖风格
- mood 从 'dread' 起,转折点升 'horror-climax'。
- 音效偏好 horror-sting + ambient-unease,少用明亮 bgm。
- (继续写你的约定……可在同目录加 references/ 放更长的清单)
```

## 进阶(backlog,时机到了再做)
- **用 skill-creator 系统化做**:Anthropic 官方的 skill-creator 能脚手架 / 评测 / 优化 skill,适合把"做游戏的经验"正式沉淀成高质量 skill。本包未内置,可选装:`/plugin install example-skills@anthropic-agent-skills`(见 README『可选扩展』)。
- **session 收尾主动回顾**:让 Claude 在做完一个项目时**主动审视**这次形成了什么模式、提议该建哪些 skill(本 skill 的收尾提示已是最简版)。
- **定期精简** `.claude/skills/`:去重、合并、删过时的——一条 prompt 就能做,不需要任何基础设施。
