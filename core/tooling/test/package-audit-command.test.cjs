'use strict';
/* 发布包审计入口回归：随包不含 node_modules，默认 /audit-game 必须只用零依赖闸；jsdom smoke 是可选增强且跳过要诚实回报。 */
var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..', '..');
var pass = 0, fail = 0;
function ok(cond, msg) { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
var cmd = read('.claude/commands/audit-game.md');
var readme = read('README.md');
var claude = read('CLAUDE.md');
var skill = read('.claude/skills/text-adventure-game/SKILL.md');
var newGame = read('.claude/commands/new-game.md');
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
var surfaces = [skill, newGame, translate, auditor, principles, debugRule];
ok(surfaces.every(function (s) { return /assembly-probe\.mjs/.test(s) && /jsdom[^\n]*(可选|安装|跳过)/.test(s); }), 'P6 skill/new-game/translate/auditor/rules 同步采用零依赖 probe + 可选 jsdom 边界，避免旁路 prompt 复发');
var defaultBuildAt = cmd.indexOf('node pipeline/build/build.mjs src/index.html`');
var smokeBuildAt = cmd.indexOf('node pipeline/build/build.mjs src/index.html --smoke');
ok(defaultBuildAt < 0 || smokeBuildAt < defaultBuildAt, 'P7 有 jsdom 时直接以事务型 --smoke 构建 canonical output，不能先用未烟雾验证的默认构建覆盖它');

console.log('════ 发布包审计入口回归:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
