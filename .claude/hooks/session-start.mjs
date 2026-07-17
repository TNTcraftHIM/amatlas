#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
 * SessionStart hook(引擎 · 做游戏层)— 进度回灌
 * ─────────────────────────────────────────────────────────────
 * 为什么:用引擎做游戏是长任务,mid-session compact / 新会话后易丢
 *   "做到哪 / 下一步 / canon 关键事实"。把项目根 PROGRESS.md 启动时
 *   回灌进上下文,不依赖对话窗口(S6.5 指导原则:留痕到文件 + 启动回灌)。
 * 为什么 Node:Claude Code 全平台自带 node;免 bash/CRLF/shebang 坑。
 * 注入方式:官方稳健式 JSON `hookSpecificOutput.additionalContext`;
 *   仅 exit 0 生效。永远 exit 0 = 纯信息,绝不阻断会话。
 * 覆盖:官方 SessionStart matcher 有四个 startup/resume/clear/compact
 *   (已查证 hooks.md);**省略 matcher = 四者全触发**(含 compact)——
 *   即 compact 后本 hook 会触发、回灌 PROGRESS,是已知确定行为,非"随版本
 *   bonus"。当前**有意省略 matcher 求简单**。但官方 #43733:hook 触发 ≠
 *   模型必然读注入;mid-compact 仍叠 CLAUDE.md 的 Compact Instructions 段
 *   做多重保证。
 * PROGRESS.md 每游戏独有、被 .gitignore；只有约定位置存在 world 时才把它
 * 当作当前游戏进度。空白发行包/引擎维护会话保持中性，创建游戏走 /new-game
 * 类型路由，不从“缺 PROGRESS”猜成文字冒险。
 * ───────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
// 进度块/状态按【行数】快速封顶(对正常情况友好);两层统一 MAX_BLOCK=50
// (审计修 · 问题4:原 wrapper 45 / engine 50 不一致且无理由 → 统一,消除无意义差异)。
const MAX_BLOCK = 50;
const MAX_GIT = 30;
// 注入【字符】总封顶(审计修 · 问题4):行数封顶不防单行超长——某几行极长时
// 50 行也可能很大。官方文档未明载 additionalContext 字符上限
// (claude-code-guide 查 hooks.md/hooks-guide.md 均无;社区传闻约 10K 量级),
// 故取保守 8000 作防御性硬封顶,防巨型 diff / 超长行撑爆注入。
// 正常 PROGRESS+状态约 3–4K,余量充足;仅病态情况触发截断。
const MAX_CHARS = 8000;
const MAX_BLOCK_CHARS = 5600;
const MAX_GIT_CHARS = 1800;

function keepTail(text, max, notice) {
  if (text.length <= max) return text;
  const room = Math.max(0, max - notice.length);
  return notice + text.slice(-room);
}

function keepHead(text, max, notice) {
  if (text.length <= max) return text;
  const room = Math.max(0, max - notice.length);
  return text.slice(0, room) + notice;
}

// 与 Stop hook / build 的项目约定同源：只看根或 src/ 的 world，绝不递归
// 命中 examples/ 内置范本。PROGRESS 本身不是项目身份——它可能是陈旧孤儿文件。
function findWorld() {
  for (const rel of ['world.js', 'world.mjs', 'world.json',
                     'src/world.js', 'src/world.mjs', 'src/world.json']) {
    if (fs.existsSync(path.join(PROJECT, rel))) return rel;
  }
  return null;
}

function progress() {
  const fp = path.join(PROJECT, 'PROGRESS.md');
  let text;
  try { text = fs.readFileSync(fp, 'utf8'); } catch { return null; }
  const body = text.replace(/\s+$/, '');
  if (!body) return null;
  const lines = body.split('\n');
  const omitted = Math.max(0, lines.length - MAX_BLOCK);
  const recent = omitted
    ? lines.slice(-MAX_BLOCK).join('\n')
    : body;
  const notice = omitted
    ? `…(前 ${omitted} 行及超出字符预算的旧进度已省略，完整见 PROGRESS.md)\n`
    : '…(旧进度前部因字符上限省略，完整见 PROGRESS.md)\n';
  return keepTail(recent, MAX_BLOCK_CHARS, notice);
}

function gitStatus() {
  const r = spawnSync('git', ['status', '--short'], { cwd: PROJECT, encoding: 'utf8' });
  if (r.status !== 0) return '(非 git 仓库 / git 不可用)';
  const out = (r.stdout || '').replace(/\s+$/, '');
  if (!out) return '(工作区干净)';
  const lines = out.split('\n');
  const status = lines.length > MAX_GIT
    ? lines.slice(0, MAX_GIT).join('\n') + `\n…(余 ${lines.length - MAX_GIT} 项)`
    : out;
  return keepHead(status, MAX_GIT_CHARS, '\n…(git status 达字符上限，完整见 git)');
}

// DEBUG 模式探测(S11-a):项目根有 DEBUG 文件 → 回灌里加一行醒目提示,
//   让本会话维护 PIPELINE-LOG(规则正文 .claude/rules/debug-pipeline-log.md)。
//   仅 DEBUG 存在时注入一行 → 平时零负担(返回 null 被下方 filter 滤掉);
//   呼应 #43733(注入≠必读)的多重保证之一:规则始终加载 + 此处启动再提醒。
function debugLine() {
  try { fs.accessSync(path.join(PROJECT, 'DEBUG')); } catch { return null; }
  return '⚙⚙ DEBUG 模式开启 → **现在起,每完成一个有意义的步骤就立刻追加 `PIPELINE-LOG.md`**(读完一批 references / 做一个设计·结构决策 / 写完一个节点·模块 / 跑一次验证),每步 3–5 行:读了什么 / 决策 + 放弃的备选 / **困惑·卡住〔最值钱〕** / 照着哪段 reference。**不是等结束再补**——事后回忆不起当时的困惑。格式见 `.claude/rules/debug-pipeline-log.md`;Stop hook 会强制(空/过短结束时退回)。';
}

const world = findWorld();
const p = world ? progress() : null;
const parts = world
  ? [
      '══ Amatlas 引擎会话启动 · 检测到游戏项目(动手前先读)══',
      debugLine(),
      p || `(检测到 ${world},但无 PROGRESS.md。先读现有 src/canon；不要假定它是新游戏或覆盖现有内容。)`,
      '── git status --short ──',
      gitStatus(),
      '══ 有进度则核对「下一步 / 待验证」;compact 后按当前游戏类型重读相关 skill/references ══'
    ]
  : [
      '══ Amatlas 引擎会话启动 · 未检测到游戏项目 ══',
      debugLine(),
      '(根目录及 src/ 均无 world 文件。不要推断当前游戏或默认类型；若用户要创建游戏，走 /new-game 类型路由。)',
      '── git status --short ──',
      gitStatus(),
      '══ 等待并按用户任务处理；只有开始具体游戏后才维护 canon.md / PROGRESS.md ══'
    ];
const filteredParts = parts.filter(Boolean);
let ctx = filteredParts.join('\n');
if (ctx.length > MAX_CHARS) {
  const notice = '\n…(注入达字符上限，完整见 PROGRESS.md + git status)';
  ctx = ctx.slice(0, MAX_CHARS - notice.length) + notice;
}
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ctx }
}));
process.exit(0);
