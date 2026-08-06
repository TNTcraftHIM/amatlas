'use strict';
/* 发布引擎入口契约：AGENTS 工具中立承重，CLAUDE 只叠 Claude 专属能力。 */
var fs = require('fs');
var path = require('path');
var ROOT = process.env.AMATLAS_ENTRYPOINT_TEST_ROOT
  ? path.resolve(process.env.AMATLAS_ENTRYPOINT_TEST_ROOT)
  : path.join(__dirname, '..');
var pass = 0, fail = 0;

function ok(cond, msg) {
  if (cond) pass++;
  else { fail++; console.log('  ✗ ' + msg); }
}
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function firstEffectiveLine(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).map(function (line) { return line.trim(); })
    .find(function (line) { return line && !/^<!--/.test(line); }) || '';
}
function hasLargeFencedTemplate(md) {
  var fence = /^```(?:js|javascript|html)\s*\r?\n([\s\S]*?)\r?\n```\s*$/gmi;
  var match;
  while ((match = fence.exec(md))) if (match[1].length >= 240) return true;
  return false;
}
function markdownFiles(root, relative) {
  var dir = path.join(root, relative || '');
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(function (entry) {
    var rel = path.posix.join((relative || '').replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) return markdownFiles(root, rel);
    return entry.isFile() && /\.md$/i.test(entry.name) ? [rel] : [];
  });
}
function instructionBudget(surfaces, totalLimit, lineLimit) {
  var total = surfaces.reduce(function (sum, surface) { return sum + Buffer.byteLength(surface.text, 'utf8'); }, 0);
  var longLines = surfaces.flatMap(function (surface) {
    return surface.text.split(/\r?\n/).map(function (line, index) {
      return { file: surface.file, line: index + 1, bytes: Buffer.byteLength(line, 'utf8') };
    });
  }).filter(function (line) { return line.bytes > lineLimit; });
  return { ok: total <= totalLimit && longLines.length === 0, total: total, longLines: longLines };
}

console.log('── engine agent entrypoints ──');
var agentsPath = path.join(ROOT, 'AGENTS.md');
var claudePath = path.join(ROOT, 'CLAUDE.md');
ok(fs.existsSync(agentsPath), 'E1 engine/AGENTS.md 必须存在');
ok(fs.existsSync(claudePath), 'E2 engine/CLAUDE.md 必须存在');

var agents = fs.existsSync(agentsPath) ? read('AGENTS.md') : '';
var claude = fs.existsSync(claudePath) ? read('CLAUDE.md') : '';
var readme = read('README.md');
ok(firstEffectiveLine(claude) === '@AGENTS.md', 'E3 engine CLAUDE 首个有效行必须是 @AGENTS.md');
ok(/src\/world\.js/.test(agents) && /已存在|现有作品/.test(agents) && /不得覆盖|不要覆盖|禁止覆盖/.test(agents),
  'E4 已有 src/world.js 必须视为现有作品且不得覆盖');
ok(/src\/world\.js/.test(agents) && /src\/game\.js/.test(agents) && /src\/index\.html/.test(agents) && /Amatlas\.boot/.test(agents),
  'E5 AGENTS 必须保留三源文件与 boot 入口');
ok(['scene', 'encounter', 'cutscene', 'maze3d'].every(function (name) { return agents.indexOf(name) >= 0; }),
  'E6 AGENTS 必须路由 scene/encounter/cutscene/maze3d');
ok(/core\/runtime\/engine-core\.js/.test(agents) && /不碰|不得修改|不要修改/.test(agents), 'E7 类型无关 core 不得修改');
ok(/graph-audit\.mjs/.test(agents) && /assembly-probe\.mjs/.test(agents) && /pipeline\/build\/build\.mjs/.test(agents),
  'E8 AGENTS 必须保留 graph + assembly + build 三闸');
ok(/text-adventure-game/.test(agents) && /examples\//.test(agents) && /references\//.test(agents) &&
    !/\.(?:agents|claude)\/skills\//.test(agents),
  'E9 AGENTS 必须按能力名路由 skill/example/reference，且不拥有客户端专属 skill 路径');
ok(!/按\s*`?AGENTS\.md`?\s*的?[^\n]*(?:工作流|五步)/.test(readme) &&
    /AGENTS\.md[^\n]*(?:路由|对应 skill)/.test(readme),
  'E9b README 必须把 AGENTS 描述为路由，工作流归 skill，不能声称 AGENTS 拥有五步工作流');
ok(/公开|部署|发布/.test(agents) && /覆盖/.test(agents) && /明确确认|明确授权|先确认/.test(agents),
  'E10 公开部署与覆盖必须保留确认门');
ok(!hasLargeFencedTemplate(agents), 'E11 AGENTS 不得内嵌 fenced 大 JS/HTML 模板');
ok(!/\b(?:13|15|20|22|35)\b/.test(agents), 'E12 AGENTS 不得复制 13/15/20/22/35 等活数量');
ok(!/\b\d+\.\d+\.\d+(?:[-+][\w.-]+)?\b/.test(agents) && !/当前(?:版本|分支)|\bSHA\b|codex\//i.test(agents) && !/\b[0-9a-f]{12,40}\b/i.test(agents),
  'E13 AGENTS 不得复制活版本、当前分支或 SHA');
ok(/commands?|斜杠命令/i.test(claude) && /\.claude\/skills\/text-adventure-game\/SKILL\.md/.test(claude) &&
    /SessionStart/.test(claude) && /Stop/.test(claude) && /PreCompact/.test(claude) && /compact/i.test(claude),
  'E14 CLAUDE 只补 commands/Claude skill 路径/hooks/compact 路由');
ok(Buffer.byteLength(claude, 'utf8') < 4000 && !/^## (?:架构|模块|游戏由三个源文件|工作流|修改分层)/m.test(claude) && !hasLargeFencedTemplate(claude),
  'E15 CLAUDE 不得复制完整模块/创作教程');

var soul = read('SOUL.md');
var craftRule = read('.claude/rules/craft-and-autonomy.md');
var progressRef = read('docs/progress-format.md');
var consistencyRef = read('.claude/skills/text-adventure-game/references/consistency-guardrails.md');
var reviewResponseRef = read('.claude/skills/text-adventure-game/references/review-report-response-addendum.md');
ok(/docs\/progress-format\.md/.test(soul) && /docs\/progress-format\.md/.test(craftRule) &&
    !/已完成[^\n]*进行中[^\n]*下一步/.test(soul) && !/恢复旧会话/.test(soul) &&
    !/每个完成子步更新 `PROGRESS\.md`/.test(craftRule),
  'E16 SOUL/rule 只路由唯一 progress reference，不再定义字段、频率或独立恢复流程');
ok(/AMATLAS:PROGRESS:START/.test(progressRef) && /AMATLAS:PROGRESS:END/.test(progressRef) &&
    /短期原型/.test(progressRef) && /暂不创建/.test(progressRef),
  'E17 progress reference 保持唯一 marker 合同与短原型例外');
ok([consistencyRef, reviewResponseRef].every(function (source) {
    return /docs\/progress-format\.md/.test(source) && /不另(?:规定|定义).*`PROGRESS\.md`.*(?:payload|更新频率)/.test(source);
  }) && !/把本批的总结[^\n]*写进 PROGRESS\.md/.test(consistencyRef) &&
    !/在 PROGRESS\.md 中记录本阶段修复内容/.test(reviewResponseRef),
  'E17b 按需 references 只能路由 progress owner，不能再定义报告 payload 或更新频率');

var expectedCommands = [
  'audit-game.md', 'balance-check.md', 'build.md', 'new-game.md',
  'polish-game.md', 'revisit-check.md', 'translate-game.md'
];
var commands = fs.readdirSync(path.join(ROOT, '.claude', 'commands')).filter(function (name) { return /\.md$/.test(name); }).sort();
ok(JSON.stringify(commands) === JSON.stringify(expectedCommands), 'E18 七个现役 Claude command 必须保持完整');
var sameNameSkills = expectedCommands.map(function (name) { return name.replace(/\.md$/, ''); })
  .filter(function (name) { return fs.existsSync(path.join(ROOT, '.claude', 'skills', name, 'SKILL.md')); });
ok(sameNameSkills.length === 0, 'E19 不得新增会旁路 command 安全门的同名 skill: ' + sameNameSkills.join(','));

var engineRuleFiles = markdownFiles(ROOT, '.claude/rules').sort();
var engineSurfaces = [
  { file: 'AGENTS.md', text: agents },
  { file: 'CLAUDE.md', text: claude }
].concat(engineRuleFiles.map(function (rel) {
  return { file: rel, text: read(rel) };
}));
var engineBudget = instructionBudget(engineSurfaces, 10000, 1000);
ok(engineBudget.ok,
  'E20 engine 自动加载层必须 ≤10000 bytes 且单行 ≤1000 bytes；total=' + engineBudget.total +
  ' long=' + engineBudget.longLines.map(function (line) { return line.file + ':' + line.line + '=' + line.bytes; }).join(','));

console.log('════ engine agent entrypoints:' + pass + ' PASS / ' + fail + ' FAIL ════');
process.exit(fail ? 1 : 0);
