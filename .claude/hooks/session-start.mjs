#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { readProgressFile } from './progress-current.mjs';

const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const MAX_CONTEXT_CHARS = 8000;
const MAX_GIT_LINES = 30;
const MAX_GIT_CHARS = 1800;
const GIT_TIMEOUT_MS = 1500;
const GIT_MAX_BUFFER_BYTES = 256 * 1024;
const WORLD_PATHS = [
  'world.js', 'world.mjs', 'world.json',
  'src/world.js', 'src/world.mjs', 'src/world.json'
];

function clipHead(text, max, notice) {
  if (text.length <= max) return text;
  if (max <= 0) return '';
  if (notice.length >= max) return notice.slice(0, max);
  return text.slice(0, max - notice.length) + notice;
}

function findWorld() {
  return WORLD_PATHS.find((rel) => fs.existsSync(path.join(PROJECT, rel))) || null;
}

function gitStatus() {
  const command = 'git status --short';
  const result = spawnSync('git', ['status', '--short'], {
    cwd: PROJECT,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
    killSignal: 'SIGTERM',
    windowsHide: true
  });
  if (result.error && result.error.code === 'ETIMEDOUT') {
    return `(${command} timeout after ${GIT_TIMEOUT_MS}ms)`;
  }
  if (result.error && result.error.code === 'ENOBUFS') {
    return `(${command} ENOBUFS; maxBuffer ${GIT_MAX_BUFFER_BYTES} bytes)`;
  }
  if (result.error) return `(${command} execution error ${result.error.code || 'UNKNOWN'}: ${result.error.message})`;
  if (result.status !== 0) return '(not a git repository / git unavailable)';
  const output = (result.stdout || '').replace(/\s+$/, '');
  if (!output) return '(working tree clean)';
  const lines = output.split(/\r?\n/);
  const lineBounded = lines.length > MAX_GIT_LINES
    ? lines.slice(0, MAX_GIT_LINES).join('\n') + `\n...(remaining ${lines.length - MAX_GIT_LINES} entries; see git)`
    : output;
  return clipHead(lineBounded, MAX_GIT_CHARS, '\n...(git status character limit reached; see git)');
}

function debugLine() {
  try {
    fs.accessSync(path.join(PROJECT, 'DEBUG'));
  } catch {
    return null;
  }
  return '⚙⚙ DEBUG 模式开启 → **现在起,每完成一个有意义的步骤就立刻追加 `PIPELINE-LOG.md`**(读完一批 references / 做一个设计·结构决策 / 写完一个节点·模块 / 跑一次验证),每步 3–5 行:读了什么 / 决策 + 放弃的备选 / **困惑·卡住〔最值钱〕** / 照着哪段 reference。**不是等结束再补**——事后回忆不起当时的困惑。格式见 `.claude/rules/debug-pipeline-log.md`;Stop hook 会强制(空/过短结束时退回)。';
}

function progressContext(world) {
  const filePath = path.join(PROJECT, 'PROGRESS.md');
  const result = readProgressFile(filePath, PROJECT);
  if (result.status === 'valid') {
    return `-- PROGRESS.md current (valid, opaque) --\n${result.current}`;
  }
  if (result.status === 'missing') {
    return world
      ? `(Detected ${world}, but root PROGRESS.md is missing. Read root canon.md if present; do not assume this is a new game or overwrite existing work.)`
      : '(No world or PROGRESS.md exists at root or src/. Do not infer a game type; use /new-game when the user asks to create one.)';
  }
  if (result.status === 'legacy') {
    return `(PROGRESS.md state:legacy; path:${filePath}; ${result.lineCount} lines / ${result.codeUnitCount} UTF-16 code units. Body not injected. 编辑前必须显式完整读取该文件，再按 docs/progress-format.md 处理。)`;
  }
  if (result.status === 'invalid') {
    return `(PROGRESS.md state:invalid; path:${filePath}; ${result.errors.join('; ')}. Body not injected; repair explicitly using docs/progress-format.md.)`;
  }
  if (result.status === 'oversized') {
    return `(PROGRESS.md state:oversized; path:${filePath}; ${result.fileBytes} bytes exceeds ${result.maximumFileBytes}. Body not injected; reduce the ordinary file before reading it through recovery hooks.)`;
  }
  if (result.status === 'non_regular' || result.status === 'tree_external') {
    return `(PROGRESS.md state:${result.status}; path:${filePath}; file type:${result.fileType}. Body not injected; root PROGRESS.md must be an ordinary file contained in the project.)`;
  }
  return `(PROGRESS.md state:unreadable; path:${filePath}; ${result.code}: ${result.error}. Body not injected and the file was not changed.)`;
}

function buildContext(world) {
  const parts = world
    ? [
        '== Amatlas session start: game project detected ==',
        debugLine(),
        progressContext(world),
        '-- git status --short --'
      ]
    : [
        '== Amatlas session start: 未检测到游戏项目（可能存在 pre-world current）==',
        debugLine(),
        progressContext(null),
        '-- git status --short --'
      ];
  const suffix = world
    ? '== Check current/next/verification; after compact reload references for this game type =='
    : '== Continue a valid pre-world current when present; otherwise wait for the user task ==';
  const prefix = parts.filter(Boolean).join('\n') + '\n';
  const ending = '\n' + suffix;
  const git = gitStatus();
  const gitBudget = MAX_CONTEXT_CHARS - prefix.length - ending.length;
  const boundedGit = clipHead(git, gitBudget, '\n...(Git section reduced to keep total SessionStart context within 8000 characters; see git)');
  return prefix + boundedGit + ending;
}

const context = buildContext(findWorld());
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context }
}));
