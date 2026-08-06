'use strict';
/* 发布包审计入口回归：随包不含 node_modules，默认 /audit-game 必须只用零依赖闸；jsdom smoke 是可选增强且跳过要诚实回报。 */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function hasLargeFencedTemplate(md) {
  var fence = /^```(?:js|javascript|html)\s*\r?\n([\s\S]*?)\r?\n```\s*$/gmi;
  var match;
  while ((match = fence.exec(md))) {
    if (match[1].length >= 240) return true;
  }
  return false;
}
var cmd = read('.claude/commands/audit-game.md');
var readme = read('README.md');
var claude = read('CLAUDE.md');
var skill = read('.claude/skills/text-adventure-game/SKILL.md');
var newGame = read('.claude/commands/new-game.md');
var polishGame = read('.claude/commands/polish-game.md');
var translate = read('.claude/commands/translate-game.md');
var auditor = read('.claude/agents/narrative-auditor.md');
var principles = read('.claude/rules/auditing-principles.md');
var debugRule = read('.claude/rules/debug-pipeline-log.md');

console.log('── 发布包 /audit-game 依赖边界 ──');
ok(/graph-audit\.mjs src\/world\.js/.test(cmd) && /assembly-probe\.mjs src\/index\.html/.test(cmd) && /build\.mjs src\/index\.html(?! --smoke)/.test(cmd), 'P1 默认审计链必须含 graph + assembly + 无 --smoke 构建（发布包仅 Node 即可跑）');
ok(/require\.resolve\(['"]jsdom['"]\)/.test(cmd) && /--smoke/.test(cmd) && /跳过|未安装|可选/.test(cmd), 'P2 /audit-game 仅在检测到 jsdom 时跑 --smoke，缺失时明确记录跳过而非整条失败');
ok(/不接受目标路径参数/.test(cmd) && /固定工位 `src\/`/.test(cmd) && !/argument-hint:\s*<path\/to\//.test(cmd) && !/审计游戏:\s*\$ARGUMENTS/.test(cmd) && /\/audit-game\s+# 审计游戏/.test(readme) && !/\/audit-game\s+src\/world\.js/.test(readme), 'P3 /audit-game 参数契约明确只审当前 src/，不再用路径 hint/$ARGUMENTS 假装路由任意目标');
ok(/基础能力[^\n]*Node\.js/.test(readme) && /基础审计\/构建只依赖它/.test(readme) && /jsdom[^\n]*(可选|增强)/.test(readme) && !/本包全部工具只依赖它|唯一依赖是 Node\.js[^\n]*全是纯 node 零依赖/.test(readme), 'P4 README 只声称基础链依赖 Node，并写清 jsdom 是可选烟雾增强');
ok(/assembly-probe\.mjs/.test(claude) && /jsdom[^\n]*(可选|安装)/.test(claude), 'P5 端用户 CLAUDE 校验入口包含零依赖 assembly-probe，并标明 jsdom 可选前提');
var surfaces = [skill, translate, auditor, principles, debugRule];
ok(surfaces.every(function (s) { return /assembly-probe\.mjs/.test(s) && /jsdom[^\n]*(可选|安装|跳过)/.test(s); }), 'P6 skill/translate/auditor/rules 同步采用零依赖 probe + 可选 jsdom 边界，避免旁路 prompt 复发');
var defaultBuildAt = cmd.indexOf('node pipeline/build/build.mjs src/index.html`');
var smokeBuildAt = cmd.indexOf('node pipeline/build/build.mjs src/index.html --smoke');
ok(defaultBuildAt < 0 || smokeBuildAt < defaultBuildAt, 'P7 有 jsdom 时直接以事务型 --smoke 构建 canonical output，不能先用未烟雾验证的默认构建覆盖它');

console.log('── 发布包 command / skill 信息所有权 ──');
var expectedCommands = [
  'audit-game.md',
  'balance-check.md',
  'build.md',
  'new-game.md',
  'polish-game.md',
  'revisit-check.md',
  'translate-game.md'
];
var actualCommands = fs.readdirSync(path.join(ROOT, '.claude', 'commands'))
  .filter(function (name) { return /\.md$/.test(name); })
  .sort();
ok(JSON.stringify(actualCommands) === JSON.stringify(expectedCommands), 'P8 七个现役 command 路径必须完整且不增删/改名');
ok(/\$ARGUMENTS/.test(newGame) && /src\/world\.js/.test(newGame), 'P9 /new-game 保留参数入口与当前 src/world.js 安全检查');
var initialGate = newGame.slice(newGame.indexOf('## 第 0 步'), newGame.indexOf('1. **继续旧作**'));
ok(/src\/world\.js/.test(initialGate) && /PROGRESS\.md/.test(initialGate) && /canon\.md/.test(initialGate) &&
    /任一|任何一个/.test(initialGate) && /立即停下|先停下/.test(initialGate),
  'P9b /new-game 必须在调用 skill 前同时发现 world 与 pre-world current/canon，不能只凭 world 判断空工位');
ok(/三选一/.test(newGame) && /继续/.test(newGame) && /归档/.test(newGame) && /明确[^\n。]*覆盖|覆盖[^\n。]*明确/.test(newGame), 'P10 /new-game 已有作品安全门必须给继续/归档/明确覆盖三选一');
ok(/text-adventure-game/.test(newGame) && !fs.existsSync(path.join(ROOT, '.claude', 'skills', 'new-game', 'SKILL.md')), 'P11 /new-game 必须调用 text-adventure-game skill，且不得创建会旁路 command 的同名 skill');
ok(!hasLargeFencedTemplate(newGame), 'P12 /new-game 不得复制 fenced JS/HTML 大模板；可执行模板只由正式 examples 拥有');
ok(!/\b(?:13|20|22|35)\b/.test(newGame), 'P13 /new-game 不得复制会漂移的能力活数量 13/20/22/35');
ok(!/阶段\s*1[^\n]{0,40}必须产出\s*`?canon\.md`?/i.test(newGame), 'P14 /new-game 不得 blanket 强制短原型创建 canon；规模/canon 策略归 skill');
var archiveBranch = (newGame.match(/2\. \*\*归档旧作\*\*：([^\n]*(?:\n(?!3\. \*\*覆盖旧作)[^\n]*)*)/) || [])[1] || '';
var overwriteBranch = (newGame.match(/3\. \*\*覆盖旧作\*\*：([^\n]*(?:\n(?!## 第 1 步)[^\n]*)*)/) || [])[1] || '';
ok(/PROGRESS\.md/.test(archiveBranch) && /canon\.md/.test(archiveBranch) && /一并移入归档|一并归档/.test(archiveBranch) &&
    /无关/.test(archiveBranch) && /不确定/.test(archiveBranch) && /停下|询问/.test(archiveBranch),
  'P15 归档分支必须逐一处置根 current/canon：旧作归档、无关保留、归属不确定停问');
ok(/PROGRESS\.md/.test(overwriteBranch) && /canon\.md/.test(overwriteBranch) && /明确确认|明确.*覆盖/.test(overwriteBranch) &&
    /删除|备份/.test(overwriteBranch) && /不能留在根目录|不得残留|移出根目录/.test(overwriteBranch) &&
    /无关/.test(overwriteBranch) && /不确定/.test(overwriteBranch) && /停下|询问/.test(overwriteBranch),
  'P16 覆盖分支必须把旧作 current/canon 纳入确认并从根移除，不确定即停问');
var stepZero = newGame.slice(newGame.indexOf('## 第 0 步'), newGame.indexOf('## 第 1 步'));
ok(/进入第 1 步前/.test(stepZero) && /PROGRESS\.md/.test(stepZero) && /canon\.md/.test(stepZero) &&
    /不得残留/.test(stepZero) && /归属未决/.test(stepZero),
  'P17 调用创作 skill 前必须不存在已归档/覆盖旧作状态或归属未决根文件');
ok(/≤8\s*节点短原型\s*fast path/i.test(skill) && /≤8\s*节点短原型无需创建/.test(skill), 'P18 text-adventure-game skill 保留 ≤8 节点 fast path 与免建 canon 策略');
ok(/examples\/text-adventure-demo\/game\.js/.test(skill) && /examples\/text-adventure-demo\/index\.html/.test(skill), 'P16 text-adventure-game skill 必须指向正式 example 的 JS/HTML 模板');
ok(/graph-audit\.mjs src\/world\.js/.test(skill) && /assembly-probe\.mjs src\/index\.html/.test(skill) && /build\.mjs src\/index\.html/.test(skill), 'P17 text-adventure-game skill 保留 graph / assembly / build 三闸');
ok(/references\/audio-system\.md/.test(polishGame) && !/(?:music|音乐)[^\n]{0,32}\b22\b|\b22\b[^\n]{0,32}(?:music|音乐)/i.test(polishGame) && !/(?:ambient|环境)[^\n]{0,32}\b13\b|\b13\b[^\n]{0,32}(?:ambient|环境)/i.test(polishGame), 'P18 /polish-game 音乐/声景只链接 audio-system，不复制 22/13 数量');
ok(/约\s*10\s*万字/.test(skill) && !/60\s*万字/.test(skill), 'P19 skill 案例事实必须是约 10 万字，不得保留已证伪的 60 万字');
ok(/examples\/text-adventure-demo\/game\.js/.test(polishGame) && !/new-game 模板注释/.test(polishGame), 'P20 /polish-game 成就精修必须路由正式 example，不得指向已从 /new-game 删除的模板');

console.log('════ 发布包审计入口回归:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
