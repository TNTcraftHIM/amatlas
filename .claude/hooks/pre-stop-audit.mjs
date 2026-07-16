#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
 * Stop hook — 完成前强制结构审计(跨平台 Node.js / ESM 版)
 * ─────────────────────────────────────────────────────────────
 * 为什么用 Node 而非 bash:
 *   本包以 Node.js 为唯一依赖(README 首次设置含 node -v 预检);hook 自身就跑在 node 里。
 *   bash 在 Windows 上依赖 Git Bash,且 CRLF 换行会破坏 shebang
 *   (变成 bash\r → "bad interpreter")。Node 读文件内容,免疫这些问题。
 *
 * 模块化游戏的世界数据约定在 world.js(导出 {start,maps},见 pipeline/build/build.mjs)。
 * 完成前跑【类型无关】core/tooling/graph-audit.mjs(P0 死链/坏 start,退出码 2)。
 * 无 world.js(还没开始 / 纯实验)→ 放行(不假拦截);构建期准入门(build.mjs)会再卡一道。
 *
 * 【路径一律基于 PROJECT 绝对路径】:目录列举 / 存在性检查 / 传给审计器的路径都用
 *   path.join(PROJECT, …),不依赖运行时 cwd(hook 的 cwd 官方未文档化);
 *   PROJECT 来自 CLAUDE_PROJECT_DIR(Claude Code 导出)兜底 process.cwd()。
 *
 * 它做什么:
 *   1. 读 stdin JSON,若 stop_hook_active 为 true → 放行(防无限循环)
 *   2. DEBUG 文件在 → PIPELINE-LOG.md 必须有实质内容,否则 exit 2 退回补记
 *   3. 找 world 源(根 / src/);找到 + graph-audit 在 → 跑【静态图审计】;P0 → exit 2、原因回灌
 *   3.5 输出目录约定:约定位置(根/src)没 world.js,但项目别处(排引擎自带目录)有 → 游戏放错位置
 *       (两道闸只在约定位置查、会被跳过)→ exit 2 提示移到 src/。从源头限定输出目录,而非到处找。
 *   4. 找 index.html(根 / src/);有 + assembly-probe 在 → 跑【零依赖装配探针】(无需 jsdom):
 *      [确认][P0] 装配崩(eval 抛 / createEngine 调不到,如 Haiku game.js:23 TypeError)→ exit 2 硬拦、回灌;
 *      [可疑][P1] 空渲染/无入口(可能是有意开场)→ stderr 提醒、不拦(留 --smoke / 人工)
 *   5. 无 world/index/工具 → 放行(不假拦截)
 * ───────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const PROJECT = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// ── 读 stdin ──────────────────────────────────────────────
let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch (e) { input = ''; }

// ── 防无限循环:stop_hook_active ──────────────────────────
try {
  const data = JSON.parse(input || '{}');
  if (data.stop_hook_active) process.exit(0);
} catch (e) { /* 无效 JSON,继续 */ }

// ══ DEBUG 强制:开 DEBUG 时,PIPELINE-LOG 必须有实质内容才放行 ════════════
// 为什么用 hook 而非只靠 rules:规则是「建议」,模型注意力有限,长任务里
//   记日志这种非核心动作很容易被遗忘(社区共识 GitHub #43557/#57200:
//   能加载、能背诵规则 ≠ 会遵守)。能用代码强制的就强制——Stop hook
//   exit 2 令「物理上无法结束」直到 PIPELINE-LOG 写够。无 DEBUG → 完全
//   不检查(向后兼容、零负担)。受上面 stop_hook_active 闸保护 → 阻断一次:
//   正常(日志一路维护好)直接通过、照常跑审计;遗忘时阻断一次 + 回灌「去补」,
//   补写后重试即放行。放在审计【之前】:DEBUG 检查与游戏格式无关。
//   退出码与 P0 审计同用 2——这是 Stop hook 唯一的「阻止结束」码
//   (其他非零码只报错不阻断),靠 stderr 文案区分两种阻断原因,不冲突。
if (fs.existsSync(path.join(PROJECT, 'DEBUG'))) {
  let log = '';
  try { log = fs.readFileSync(path.join(PROJECT, 'PIPELINE-LOG.md'), 'utf8'); } catch (e) { /* 不存在 */ }
  // 实质内容判据:去空白后 ≥ 50 字符。比「查 ## Step 标记」更稳——不锁死格式
  //   (模型可能换写法),只认「有没有真东西」;空文件 / 只有标题 → 拦。
  if (log.trim().length < 50) {
    process.stderr.write('⛔ DEBUG 模式开启,但 PIPELINE-LOG.md 为空或过短。结束前请按 .claude/rules/debug-pipeline-log.md 的格式补记本次管线日志(每个有意义的步骤:读了什么 / 决策 / 备选 / 困惑 / 引用),再结束。\n');
    process.exit(2);
  }
}

// ══ 结构审计:模块化世界图(world.js)→ graph-audit ══════════════
// world 源定位用【约定】(根 / src/),不递归搜:避免误命中(如引擎自带
// examples/text-adventure-demo/world.js 不在这些位置 → 不会被当成用户游戏)。约定见 build.mjs。
function findWorld() {
  for (const rel of ['world.js', 'world.mjs', 'world.json',
                     'src/world.js', 'src/world.mjs', 'src/world.json']) {
    const p = path.join(PROJECT, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const world = findWorld();
const graphAudit = path.join(PROJECT, 'core', 'tooling', 'graph-audit.mjs');

if (world && fs.existsSync(graphAudit)) {
  // 用当前 node(process.execPath,绝对路径)跑 graph-audit CLI;
  // 不走 shell → 免 Windows 路径引号/转义坑(node 自带,无 .cmd shim 问题)。
  const res = spawnSync(process.execPath, [graphAudit, world],
                        { cwd: PROJECT, encoding: 'utf8' });
  if (res.status !== 0) {
    process.stderr.write(`⛔ 完成前图审计未通过(${path.relative(PROJECT, world)} 有 P0:死链/坏 start)。请先修:\n`);
    const out = (res.stdout || '') + (res.stderr || '');
    out.split('\n').filter(l => l.includes('[P0]')).forEach(l => process.stderr.write(l + '\n'));
    process.exit(2);
  }
}

// ══ 输出目录约定:游戏放错位置(不在 根/src)→ 两道闸会被跳过 → 拦 + 提示移到 src/ ════
// 根本上限定输出目录(指引把游戏放 src/),而非让 hook 到处找模型乱放的位置。
// 约定位置没 world.js、但项目别处(排引擎自带目录)有 → 模型把游戏放错了地方。
function findMisplacedWorld() {
  const SKIP = new Set(['node_modules', '.git', 'examples', 'dist',
    'core', 'modules', 'presenters', 'plugins', 'pipeline', 'docs', '.claude', 'test']);
  const stack = [PROJECT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { continue; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP.has(e.name)) stack.push(path.join(dir, e.name)); }
      else if (e.name === 'world.js' || e.name === 'world.mjs' || e.name === 'world.json') {
        return path.relative(PROJECT, path.join(dir, e.name));
      }
    }
  }
  return null;
}
if (!world) {
  const misplaced = findMisplacedWorld();
  if (misplaced) {
    process.stderr.write('⛔ 游戏的 world.js 在 `' + misplaced.replace(/\\/g, '/') + '`,不在约定输出目录 `src/`(或项目根)。\n'
      + '结束前的两道闸(graph-audit 图审计 + assembly-probe 装配探针)只在约定位置查 → 当前被跳过、等于没验。\n'
      + '请把游戏文件(world.js / game.js / index.html)移到 `src/`(构建产物在 `src/dist/`),再结束。\n');
    process.exit(2);
  }
}

// ══ 运行时装配审计:源 index.html → assembly-probe(零依赖,无需 jsdom)════════
// 静态图审计查不到「语法合法但 API 接不上」的运行时崩(诊断 P1:Haiku game.js:23 那类)。
// 装配探针把游戏「跑到 view()」:[确认][P0] 装配崩 → 硬拦(零误报);[可疑][P1] 空渲染 → 仅提醒。
function findIndex() {
  for (const rel of ['index.html', 'src/index.html']) {
    const p = path.join(PROJECT, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
const indexHtml = findIndex();
const probe = path.join(PROJECT, 'core', 'tooling', 'assembly-probe.mjs');
if (indexHtml && fs.existsSync(probe)) {
  const res = spawnSync(process.execPath, [probe, indexHtml], { cwd: PROJECT, encoding: 'utf8' });
  const out = (res.stdout || '') + (res.stderr || '');
  if (res.status === 1) {                                   // [确认][P0] → 硬拦(同 graph-audit P0)
    // 文案有意【不枚举】P0 类别(v11 审计实锤:旧文案列着已删除的"插件控件裸显示"检查=强制层描述漂移)——类别以探针输出为准。
    process.stderr.write('⛔ 完成前装配探针发现 P0 缺陷(具体类别以下方清单为准,每条都带修法)。请先修:\n');
    out.split('\n').filter(l => l.includes('[P0]')).forEach(l => process.stderr.write(l + '\n'));
    process.stderr.write('⚠️ 装配崩在第一个错误处即停 → P0 可能不止一个;修完【必须重跑探针 + graph-audit 直到都退 0】,别只修报出来这一个就标完成(showcase 实测:模型修了前一个 P0、没重跑 → 漏掉后面 encounter 缺模块 → 白屏交付)。\n');
    process.exit(2);
  }
  const p1 = out.split('\n').filter(l => l.includes('[P1]'));  // [可疑][P1] 空渲染 → 提醒、不拦
  if (p1.length) {
    process.stderr.write('⚠️ 装配探针提醒(P1,不阻断;请用 build --smoke / 真浏览器或人工确认是否有意):\n');
    p1.forEach(l => process.stderr.write(l + '\n'));
  }
}

// ══ 静态文本 lint:残留 TODO/占位 · 乱码 U+FFFD · world.js 死 {{ 标记(零依赖,全 P1、不拦)════
// design-principles §10:把原本写在手册里靠人 grep 的确定性 correctness 残留检查沉淀进工具。
const slint = path.join(PROJECT, 'core', 'tooling', 'static-lint.mjs');
if (indexHtml && fs.existsSync(slint)) {
  const res = spawnSync(process.execPath, [slint, indexHtml], { cwd: PROJECT, encoding: 'utf8' });
  const p1 = ((res.stdout || '') + (res.stderr || '')).split('\n').filter(l => l.includes('[P1]'));
  if (p1.length) {
    process.stderr.write('⚠️ 静态 lint 提醒(P1,不阻断;残留待办/乱码/死 {{ 标记,交付前清掉):\n');
    p1.forEach(l => process.stderr.write(l + '\n'));
  }
}
process.exit(0); // 无 world/index/工具 / 审计通过(P1 警告不阻断)→ 放行
