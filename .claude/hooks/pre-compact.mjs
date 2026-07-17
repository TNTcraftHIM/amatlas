#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
 * PreCompact hook(引擎 · 做游戏层)— compact 前留痕快照
 * ─────────────────────────────────────────────────────────────
 * 为什么:用引擎做游戏是长任务,auto-compact 在上下文将满时有损压缩,
 *   易丢"写到哪幕 / 改了哪些文件 / canon 关键事实"。本 hook 在压缩前把
 *   git 工作区差异快照到 .claude/last-precompact.txt 落盘兜底——compact 后
 *   即使 PROGRESS.md 当时没刷新,也能 cat 这份快照恢复"上次压缩前改了什么"
 *   (S6.5 指导原则:留痕到文件,不靠对话窗口)。
 * 为什么 Node:Claude Code 全平台自带 node;免 bash/CRLF/shebang 坑。
 *
 * 关键机制(已查证官方 hooks.md + 真机 /compact 实测,2026-05-30):
 *   · PreCompact 手动 /compact 与 auto-compact 都触发(实测 trigger=manual)。
 *   · exit 2 会**阻断** compaction → 本 hook **永远 exit 0**,绝不阻断
 *     (auto-compact 触发时上下文已满,阻断它会卡死会话)。
 *   · ⚠️ PreCompact **不支持** hookSpecificOutput.additionalContext:真机 /compact
 *     实测 Claude Code 拒绝该 JSON(“Hook JSON output validation failed”)。schema
 *     仅 PreToolUse/UserPromptSubmit/PostToolUse/PostToolBatch 支持 additionalContext,
 *     PreCompact 不在列(对比:SessionStart 同次实测注入成功)。→ 本 hook **不写
 *     stdout**,唯一交付物 = 快照文件;“compact 后去读”的提示由 SessionStart
 *     (compact 源触发)+ CLAUDE.md「Compact 指令」段冗余递送。
 *   · stdin(官方+实测):有 session_id / transcript_path / trigger(=manual);
 *     custom_instructions 视版本。**transcript_path 记进快照头**=完整未压缩转录指针
 *     (只记路径、不拷贝;转录由 Claude Code 持久化),进度块/PROGRESS/快照都不足时的
 *     **终极兜底**。防御式读取,不依赖某字段必在。
 *
 * 防线定位:可靠主干 = 这份**快照文件** + SessionStart 回灌 PROGRESS + CLAUDE.md
 *   「Compact 指令」段(含重唤 skill);PreCompact 自身不注入(已证 schema 拒)。
 * ───────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MAX_LINES = 120; // 快照各段封顶,防病态大 diff 撑爆文件

// ── 防御式读 stdin(官方+实测:有 session_id/transcript_path/trigger;custom_instructions 视版本)──
// 有则用、无则忽略,绝不依赖某字段必在(版本鲁棒)。
let trigger = '', custom = '', sessionId = '', transcript = '';
try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  trigger = typeof data.trigger === 'string' ? data.trigger : '';
  custom = typeof data.custom_instructions === 'string' ? data.custom_instructions : '';
  sessionId = typeof data.session_id === 'string' ? data.session_id : '';
  transcript = typeof data.transcript_path === 'string' ? data.transcript_path : '';
} catch { /* 无 stdin / 坏 JSON → 不影响快照 */ }

function git(args) {
  const r = spawnSync('git', args, { cwd: PROJECT, encoding: 'utf8' });
  if (r.status !== 0) return null;
  const out = (r.stdout || '').replace(/\s+$/, '');
  if (!out) return '';
  const lines = out.split('\n');
  return lines.length > MAX_LINES
    ? lines.slice(0, MAX_LINES).join('\n') + `\n…(余 ${lines.length - MAX_LINES} 行,见 git)`
    : out;
}

const stat = git(['diff', '--stat']);
const status = git(['status', '--short']);
const stamp = new Date().toISOString(); // 普通 node 进程,Date 可用(非 Workflow 沙箱)

const head = [
  '# Amatlas PreCompact 快照(游戏)— compact 前自动留存,可在 compact 后 cat 恢复',
  `# 何时:${stamp}${trigger ? ` · 触发:${trigger}` : ''}`,
  '# 用途:compact 有损压缩可能丢"写到哪 / 改了什么";若当时 PROGRESS.md 没刷新,用此快照补 git 差异。',
  '# 真相源仍是 PROGRESS.md + canon.md + git,本文件只是兜底。',
];
if (custom) head.push(`# 手动 /compact 指令:${custom}`);
if (transcript) head.push(`# 完整未压缩转录(终极兜底,信息不足时直接 Read 它):${transcript}`);
if (sessionId) head.push(`# session_id:${sessionId}`);
const snap = [
  ...head,
  '',
  '── git diff --stat ──',
  stat === null ? '(非 git 仓库 / git 不可用)' : (stat || '(无未提交改动)'),
  '',
  '── git status --short ──',
  status === null ? '(非 git 仓库 / git 不可用)' : (status || '(工作区干净)'),
  '',
].join('\n');

try {
  const dir = path.join(PROJECT, '.claude');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'last-precompact.txt'), snap);
} catch { /* 写不了就算,绝不阻断 compact */ }

// PreCompact 不支持 additionalContext(已实测 schema 拒,见顶部注释)→ 不写任何 stdout。
// compact 后的恢复提示由 SessionStart 回灌 PROGRESS + CLAUDE.md「Compact 指令」段
// (含「重唤 text-adventure skill」)递送。
process.exit(0);
