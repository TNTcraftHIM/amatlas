#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { readProgressFile } from './progress-current.mjs';

const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const WORLD_PATHS = [
  'world.js', 'world.mjs', 'world.json',
  'src/world.js', 'src/world.mjs', 'src/world.json'
];
const MAX_GIT_LINES = 120;
const MAX_GIT_CHARS = 4000;
const GIT_TIMEOUT_MS = 1500;
const GIT_MAX_BUFFER_BYTES = 256 * 1024;

function readInput() {
  try {
    const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function stringField(data, key, fallback) {
  return typeof data[key] === 'string' && data[key] ? data[key] : fallback;
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
  let bounded = lines.length > MAX_GIT_LINES
    ? lines.slice(0, MAX_GIT_LINES).join('\n') + `\n...(remaining ${lines.length - MAX_GIT_LINES} entries; see git)`
    : output;
  if (bounded.length > MAX_GIT_CHARS) {
    const notice = '\n...(git status character limit reached; see git)';
    bounded = bounded.slice(0, MAX_GIT_CHARS - notice.length) + notice;
  }
  return bounded;
}

function progressLines() {
  const result = readProgressFile(path.join(PROJECT, 'PROGRESS.md'), PROJECT);
  const lines = [
    'progress_path:PROGRESS.md',
    `progress_state:${result.status}`
  ];
  if (result.status === 'valid') {
    lines.push(`progress_current_code_units:${result.currentCodeUnits}`);
    lines.push('-- progress current --', result.current, '-- end progress current --');
  } else if (result.status === 'legacy') {
    lines.push(`progress_detail:${result.lineCount} lines / ${result.codeUnitCount} UTF-16 code units; body not copied`);
  } else if (result.status === 'invalid') {
    lines.push(`progress_detail:${result.errors.join('; ')}; body not copied`);
  } else if (result.status === 'oversized') {
    lines.push(`progress_detail:${result.fileBytes} bytes exceeds ${result.maximumFileBytes}; body not copied`);
  } else if (result.status === 'non_regular' || result.status === 'tree_external') {
    lines.push(`progress_detail:file type ${result.fileType}; ordinary project-contained file required; body not copied`);
  } else if (result.status === 'unreadable') {
    lines.push(`progress_detail:${result.code}: ${result.error}; body not copied`);
  }
  return lines;
}

function buildSnapshot(input) {
  const world = findWorld();
  const canonExists = fs.existsSync(path.join(PROJECT, 'canon.md'));
  return [
    '# Amatlas PreCompact snapshot v2',
    `generated_at:${new Date().toISOString()}`,
    `trigger:${stringField(input, 'trigger', 'unknown')}`,
    `session_id:${stringField(input, 'session_id', 'unknown')}`,
    `transcript_path:${stringField(input, 'transcript_path', 'unknown')}`,
    `world:${world || 'none'}`,
    ...progressLines(),
    `canon:canon.md state:${canonExists ? 'present' : 'missing'}`,
    '-- git status --short --',
    gitStatus(),
    ''
  ].join('\n');
}

function atomicWrite(target, contents) {
  const dir = path.dirname(target);
  fs.mkdirSync(dir, { recursive: true });
  const temp = path.join(dir, `.last-precompact.txt.tmp-${process.pid}-${crypto.randomUUID()}`);
  let descriptor = null;
  try {
    descriptor = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(descriptor, contents, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    fs.renameSync(temp, target);
  } catch (error) {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor); } catch {}
    }
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

try {
  atomicWrite(path.join(PROJECT, '.claude', 'last-precompact.txt'), buildSnapshot(readInput()));
} catch (error) {
  const code = error && error.code ? `${error.code}: ` : '';
  process.stderr.write(`PreCompact snapshot write failed: ${code}${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
