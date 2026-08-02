#!/usr/bin/env node
/* ════════════════════════════════════════════════════════════════════════
   codex-parity.mjs — 零依赖「Codex 兼容镜像」生成 + fail-loud 同步闸
   ════════════════════════════════════════════════════════════════════════
   设计依据: docs/codex-parity-design.md(决策 A~G)。单一真相源 = `.claude/skills/`
   (Claude Code 原生位置);`.agents/skills/` 是它的**生成镜像**——Codex 从 cwd 向上
   遍历只扫 `.agents/skills/`,原生发现不到 `.claude/skills/`,故需要一份物化拷贝
   (决策 B:不用 symlink,理由=Windows 归档可移植性 + 格式需规范化,两者 symlink 都做不到)。

   ── 变换规则(决策 D,唯一允许的变换;正文逐字镜像)────────────────────────
   1. frontmatter 缺 `name` → 用目录名补全;已有则原样保留。
   2. frontmatter 缺 `description` → fail-loud 抛错停机(Codex 必需字段)。
   3. 防御性剔除 Claude 执行专属 key(`hooks`/`allowed-tools`/`disallowed-tools`/
      `context`/`paths`)——会改变执行语义;`version`/`author`/`license`/`metadata`
      等展示性 key 原样保留(Codex 忽略,无害)。
   4. frontmatter 之后的正文、以及 references/scripts/assets 等子文件,逐字节拷贝。

   ── 镜像范围(决策 C)─────────────────────────────────────────────────────
   denylist 只排除 Anthropic 上游 skill(`skill-creator`/`webapp-testing`)——它们
   本就不随包发布(见 package-engine.sh 的 archive exclude pathspec,两处denylist
   互相注释指向,是已知接缝,非遗漏)。denylist 之外、`.claude/skills/` 下每个目录
   都视为「我们自研 + 随包发的工具中立 skill」,一律镜像。

   ── 用法 ────────────────────────────────────────────────────────────────
   node codex-parity.mjs --sync  [--root <engine根目录>]   # 生成/重建 .agents/
   node codex-parity.mjs --check [--root <engine根目录>]   # 校验镜像与源是否一致
   node codex-parity.mjs --list-shipped-skills [--root ..] # 打印本应镜像的 skill 名单
   --root 默认取脚本自身推断的 engine 根;供发布时对解包后的 payload 树校验用
   (`node <payload>/core/tooling/codex-parity.mjs --check --root <payload>`)。

   退出码: --check 漂移 = 1(打印 diff 摘要);--sync 成功 = 0;
           致命错(源缺 description / 读不到源目录)= 1；用法错 = 2。
   既可 CLI,也可 `import` 复用(`buildExpectedMirror`/`runSync`/`runCheck`),
   对标 graph-audit.mjs / assembly-probe.mjs 的「CLI + import 双态」惯例。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.join(TOOL_DIR, '..', '..'); // core/tooling → core → engine/

// 排除名单的**单一真相源**(决策 C + 用户「机械闸/单源」定调):Anthropic 上游 skill
// (skill-creator/webapp-testing)不镜像、不随包发。package-engine.sh 与 release.yml
// 都通过 `--list-denied-skills` 从这里取 exclude pathspec,不再各存一份 → 三处永不漂移。
// 大小写不敏感匹配(见 isDenied),防 `WebApp-Testing` 这类合法变体绕过排除(见设计稿 §5)。
export const DENYLIST = new Set(['skill-creator', 'webapp-testing']);
const isDenied = (name) => DENYLIST.has(name.toLowerCase());

// 会改变执行语义的 Claude 专属 frontmatter key(决策 D.3,防御性剔除)。
const STRIP_KEYS = new Set(['hooks', 'allowed-tools', 'disallowed-tools', 'context', 'paths']);

const GENERATED_NOTICE =
  '# 生成物 — 勿手改\n\n' +
  '本目录由 `core/tooling/codex-parity.mjs --sync` 从 `.claude/skills/` 生成,\n' +
  '是 Codex CLI 原生扫描的 `.agents/skills/` 镜像(Codex 从 cwd 向上遍历只认这个路径)。\n\n' +
  '真相源在 `.claude/skills/`——改 skill 内容去改源,再跑 `--sync` 重生成本目录。\n' +
  '手改本目录下的文件会在下次 `--sync` 时被覆盖,`--check` 也会把手改判为漂移。\n\n' +
  '设计依据: docs/codex-parity-design.md。\n';

class UsageError extends Error {}
class ParityError extends Error {}

function fail(msg) { throw new ParityError(msg); }

// ── frontmatter 解析(轻量、不引入 YAML 依赖;够用即可,零依赖是硬约束)───────
// 按「顶层 key」切块:非缩进的 `key:` 起始行开新块,缩进/续行归前一块。
function splitFrontmatter(md, label) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(md);
  if (!m) fail('[' + label + '] SKILL.md 缺少 frontmatter(需以 `---` 开头/结尾）');
  return { fm: m[1], body: m[2] };
}

function splitTopLevelBlocks(fm, label) {
  const lines = fm.split(/\r?\n/);
  const blocks = [];
  const absorb = (line) => {
    if (blocks.length) blocks[blocks.length - 1].lines.push(line);
    else blocks.push({ key: null, lines: [line] }); // frontmatter 起始处的空行/注释,原样保留
  };
  for (const line of lines) {
    if (line.trim() === '') { absorb(line); continue; }   // 空行:随前块
    if (/^\s/.test(line)) { absorb(line); continue; }      // 缩进续行(block scalar / 嵌套 / 列表项)
    if (/^#/.test(line)) { absorb(line); continue; }       // 顶层注释:原样保留(YAML/Codex 均容忍)
    const km = /^([A-Za-z0-9_-]+):(?:\s|$)/.exec(line);    // 规范顶层 key:(冒号后须空白或行尾)
    if (km) { blocks.push({ key: km[1].toLowerCase(), lines: [line] }); continue; }
    // 非缩进、非空、非注释、又不是规范 `key:` —— fail-loud。堵住「冒号前空格 `hooks : {}`」
    // 「引号包裹 key `"description":`」等合法但非规范的 YAML 写法:轻量切块器会漏认这类 key,
    // 导致 STRIP_KEYS 防御性剔除失效(专属字段泄漏)或必需字段误判缺失。零依赖不引 YAML 库,
    // 改为 fail-loud 要求作者写规范 frontmatter(设计稿 §5 收尾计划第 4 条)。
    fail('[' + label + '] frontmatter 顶层行不是规范 `key: value`' +
      '(不支持冒号前空格、引号包裹的 key 等写法;请改成 `key: value` 规范形):\n    ' + line.trim());
  }
  return blocks;
}

// 按决策 D 规范化 frontmatter,返回新的 frontmatter 文本(不含首尾 `---`)。
function normalizeFrontmatter(fm, dirName, label) {
  const blocks = splitTopLevelBlocks(fm, label);
  const hasKey = (k) => blocks.some((b) => b.key === k);
  if (!hasKey('description')) {
    fail('[' + label + '] SKILL.md frontmatter 缺少必需字段 `description`' +
      '(Codex 必需;fail-loud 停机,不生成残废镜像 —— 见设计稿决策 D.2)');
  }
  let kept = blocks.filter((b) => !(b.key && STRIP_KEYS.has(b.key)));
  if (!hasKey('name')) {
    kept = [{ key: 'name', lines: ['name: ' + dirName] }, ...kept];
  }
  const outLines = [];
  for (const b of kept) outLines.push(...b.lines);
  return outLines.join('\n');
}

// 规范化单个 SKILL.md 源文件 → 镜像字节(Buffer)。
function renderSkillMd(srcPath, dirName) {
  const raw = fs.readFileSync(srcPath, 'utf8');
  const { fm, body } = splitFrontmatter(raw, dirName + '/SKILL.md');
  const normalizedFm = normalizeFrontmatter(fm, dirName, dirName + '/SKILL.md');
  return Buffer.from('---\n' + normalizedFm + '\n---\n' + body, 'utf8');
}

// ── 目录树遍历(排序保证确定性)────────────────────────────────────────────
function walkFiles(dir, base) {
  base = base || dir;
  const out = [];
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch (e) { return out; }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of entries) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkFiles(abs, base));
    else if (ent.isFile()) out.push(path.relative(base, abs).split(path.sep).join('/'));
  }
  return out;
}

// 扫源 skills 目录,分出「应镜像(shipped)」与「denylist 排除(denied)」两组。
// 大小写不敏感排除(isDenied),防合法大小写变体绕过。
function scanSourceSkillDirs(claudeSkillsDir) {
  let entries;
  try { entries = fs.readdirSync(claudeSkillsDir, { withFileTypes: true }); }
  catch (e) { fail('读不到源目录 ' + claudeSkillsDir + '(' + e.message + ')'); }
  const shipped = [], denied = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    (isDenied(e.name) ? denied : shipped).push(e.name);
  }
  shipped.sort(); denied.sort();
  return { shipped, denied };
}
function listSourceSkillDirs(claudeSkillsDir) {
  return scanSourceSkillDirs(claudeSkillsDir).shipped;
}

// ── 期望镜像(纯函数:源 → { relPath(posix, 以 'skills/<name>/...' 或 'GENERATED.md' 起头): Buffer }) ──
export function buildExpectedMirror(root) {
  const claudeSkillsDir = path.join(root, '.claude', 'skills');
  const names = listSourceSkillDirs(claudeSkillsDir);
  const mirror = new Map();
  mirror.set('GENERATED.md', Buffer.from(GENERATED_NOTICE, 'utf8'));
  for (const name of names) {
    const srcDir = path.join(claudeSkillsDir, name);
    const skillMdPath = path.join(srcDir, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) fail('[' + name + '] 缺少 SKILL.md(源目录: ' + srcDir + ')');
    mirror.set('skills/' + name + '/SKILL.md', renderSkillMd(skillMdPath, name));
    for (const rel of walkFiles(srcDir)) {
      if (rel === 'SKILL.md') continue; // 已单独规范化处理
      mirror.set('skills/' + name + '/' + rel, fs.readFileSync(path.join(srcDir, rel)));
    }
  }
  return mirror;
}

// ── 磁盘上的实际镜像(.agents/ 全量,同样以 posix relPath 为 key)──────────────
function readActualMirror(root) {
  const agentsDir = path.join(root, '.agents');
  const mirror = new Map();
  for (const rel of walkFiles(agentsDir)) {
    mirror.set(rel, fs.readFileSync(path.join(agentsDir, rel)));
  }
  return mirror;
}

function diffMirrors(expected, actual) {
  const diffs = [];
  const expectedKeys = [...expected.keys()].sort();
  const actualKeys = [...actual.keys()].sort();
  for (const k of expectedKeys) {
    if (!actual.has(k)) diffs.push({ type: 'missing', path: k });
    else if (!actual.get(k).equals(expected.get(k))) diffs.push({ type: 'content-mismatch', path: k });
  }
  for (const k of actualKeys) {
    if (!expected.has(k)) diffs.push({ type: 'extra', path: k });
  }
  diffs.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return diffs;
}

// ── --sync:先删后建,全量重建 .agents/(与 vault/发布同哲学,不留孤儿)──────
export function runSync(root) {
  const expected = buildExpectedMirror(root); // 先算完整期望树,读源失败/description 缺失会在这里抛,不留半成品
  const agentsDir = path.join(root, '.agents');
  fs.rmSync(agentsDir, { recursive: true, force: true });
  for (const [rel, content] of expected) {
    const abs = path.join(agentsDir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
  return { root, agentsDir, files: expected.size };
}

// ── --check:期望 vs 磁盘逐字节比对,任一漂移即失败,点名差异 ──────────────
export function runCheck(root) {
  const expected = buildExpectedMirror(root);
  const actual = readActualMirror(root);
  const diffs = diffMirrors(expected, actual);
  return { root, diffs, expectedCount: expected.size, actualCount: actual.size };
}

// ── CLI ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { mode: null, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sync' || a === '--check' || a === '--list-shipped-skills' || a === '--list-denied-skills') {
      if (out.mode) throw new UsageError('只能指定一个模式(已有 --' + out.mode + '，又见 ' + a + '）');
      out.mode = a.replace(/^--/, '');
    } else if (a === '--root') {
      if (i + 1 >= argv.length) throw new UsageError('--root 需要一个路径参数');
      out.root = argv[++i];
    } else {
      throw new UsageError('未知参数: ' + a);
    }
  }
  if (!out.mode) throw new UsageError('需要指定 --sync / --check / --list-shipped-skills / --list-denied-skills 之一');
  return out;
}

function usage() {
  return '用法:\n' +
    '  node codex-parity.mjs --sync  [--root <engine根目录>]\n' +
    '  node codex-parity.mjs --check [--root <engine根目录>]\n' +
    '  node codex-parity.mjs --list-shipped-skills [--root <engine根目录>]\n' +
    '  node codex-parity.mjs --list-denied-skills   # 打印 denylist(单源:发布链取 exclude 用)\n';
}

function main(argv) {
  let args;
  try { args = parseArgs(argv); }
  catch (e) {
    if (e instanceof UsageError) { console.error('❌ ' + e.message + '\n\n' + usage()); return 2; }
    throw e;
  }
  const root = path.resolve(args.root || DEFAULT_ROOT);

  try {
    if (args.mode === 'list-shipped-skills') {
      const names = listSourceSkillDirs(path.join(root, '.claude', 'skills'));
      for (const n of names) console.log(n);
      return 0;
    }

    if (args.mode === 'list-denied-skills') {
      // 单一真相源:package-engine.sh / release.yml 从这里取 exclude pathspec(消灭三处漂移)。
      for (const n of [...DENYLIST].sort()) console.log(n);
      return 0;
    }

    if (args.mode === 'sync') {
      const r = runSync(root);
      const { denied } = scanSourceSkillDirs(path.join(root, '.claude', 'skills'));
      console.log('✅ 已同步 .agents/(root=' + r.agentsDir + '，' + r.files + ' 个文件；跑 --check 复核）');
      if (denied.length) console.log('  ↷ 跳过 denylist 上游 skill(不镜像/不随包发):' + denied.join(', '));
      return 0;
    }

    if (args.mode === 'check') {
      const r = runCheck(root);
      if (r.diffs.length === 0) {
        console.log('✅ .agents/ 与 .claude/skills/ 一致（' + r.expectedCount + ' 个文件，root=' + root + '）');
        return 0;
      }
      console.log('❌ Codex 镜像漂移（' + r.diffs.length + ' 处，root=' + root + '）：');
      for (const d of r.diffs) {
        const label = d.type === 'missing' ? '缺失' : d.type === 'extra' ? '多余(源已删/改名)' : '内容不一致';
        console.log('  · [' + label + '] .agents/' + d.path);
      }
      console.log('修法：跑 `node core/tooling/codex-parity.mjs --sync --root ' + root + '` 重新生成后再提交。');
      return 1;
    }
  } catch (e) {
    if (e instanceof ParityError) { console.error('❌ ' + e.message); return 1; }
    throw e;
  }
  return 2;
}

const isDirectRun = (() => {
  try { return fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || ''); }
  catch (e) { return false; }
})();
if (isDirectRun) {
  process.exit(main(process.argv.slice(2)));
}
