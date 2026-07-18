/* ════════════════════════════════════════════════════════════════════════
   codex-parity.mjs 验证(纯 node,无需 jsdom;随 test/run.cjs)。
   设计依据: docs/codex-parity-design.md §3.A(反向变异验牙——每条判据两端锁)。
   每个用例现造一棵临时 `<root>/.claude/skills/...` 源树,跑 CLI(--sync/--check/
   --list-shipped-skills),断言退出码 + 输出 + `.agents/` 磁盘产物。
   ════════════════════════════════════════════════════════════════════════ */
'use strict';
var spawnSync = require('child_process').spawnSync;
var fs = require('fs');
var path = require('path');

var TOOL = path.join(__dirname, '..', 'codex-parity.mjs');
var TMP_BASE = path.join(__dirname, 'fixtures', '_codex_parity_tmp');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { console.log('  ok  ' + name); pass++; }
  else { console.log('  X   ' + name + (detail ? '  → ' + detail : '')); fail++; }
}

function freshRoot(name) {
  var root = path.join(TMP_BASE, name);
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(root, { recursive: true });
  return root;
}

// 在 <root>/.claude/skills/<skillName>/SKILL.md 写一个 skill 源;extraFiles 是
// { 'references/foo.md': '内容', ... } 形式的附加文件(相对 skill 目录)。
function writeSkill(root, skillName, skillMd, extraFiles) {
  var dir = path.join(root, '.claude', 'skills', skillName);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMd);
  extraFiles = extraFiles || {};
  Object.keys(extraFiles).forEach(function (rel) {
    var abs = path.join(dir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, extraFiles[rel]);
  });
}

function run(args) {
  var r = spawnSync(process.execPath, [TOOL].concat(args), { encoding: 'utf8' });
  return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function sync(root) { return run(['--sync', '--root', root]); }
function check(root) { return run(['--check', '--root', root]); }
function agentsPath(root) { return path.join.apply(path, [root, '.agents'].concat(Array.prototype.slice.call(arguments, 1))); }
function readAgents(root, rel) { return fs.readFileSync(path.join(agentsPath(root), rel), 'utf8'); }

console.log('codex-parity 验证');
try {
  // ── 1. 缺 name → 补目录名;已有 name → 原样保留 ──────────────────────────
  (function () {
    var root = freshRoot('name-fill');
    writeSkill(root, 'no-name-skill',
      '---\ndescription: "无 name 的 fixture"\n---\n\n# Body\n正文一行。\n');
    var r = sync(root);
    ok('1a --sync 成功(缺 name 但有 description）', r.status === 0, r.out);
    var mirrored = readAgents(root, 'skills/no-name-skill/SKILL.md');
    ok('1b 缺 name → 镜像补目录名作 name', /^---\nname: no-name-skill\n/.test(mirrored), mirrored.slice(0, 80));

    var root2 = freshRoot('name-keep');
    writeSkill(root2, 'has-name-dir',
      '---\nname: custom-name\ndescription: "有 name 的 fixture"\n---\n\n# Body\n');
    sync(root2);
    var mirrored2 = readAgents(root2, 'skills/has-name-dir/SKILL.md');
    ok('1c 已有 name → 原样保留(不被目录名覆盖）', /^---\nname: custom-name\n/.test(mirrored2), mirrored2.slice(0, 60));
  })();

  // ── 2. 缺 description → --sync 抛错非零;有 description → 正常 ──────────
  (function () {
    var root = freshRoot('desc-missing');
    writeSkill(root, 'no-desc-skill', '---\nname: no-desc-skill\n---\n\n# Body\n');
    var r = sync(root);
    ok('2a 缺 description → --sync 非零退出', r.status !== 0 && r.status !== null, 'status=' + r.status);
    ok('2b 错误信息点名 description + skill 名', /description/.test(r.out) && /no-desc-skill/.test(r.out), r.out);
    ok('2c fail-loud 停机,不留半成品镜像', !fs.existsSync(agentsPath(root, 'skills', 'no-desc-skill')), '');

    var root2 = freshRoot('desc-present');
    writeSkill(root2, 'ok-skill', '---\nname: ok-skill\ndescription: "有描述"\n---\n\n# Body\n');
    var r2 = sync(root2);
    ok('2d 有 description → --sync 正常退出 0', r2.status === 0, r2.out);
  })();

  // ── 3. 正文 + references 子文件 → 镜像逐字节相同(hash 比对) ─────────────
  (function () {
    var root = freshRoot('body-refs');
    var body = '---\nname: rich-skill\ndescription: "带正文与引用文件"\nversion: 1.2.3\n---\n\n# 正文标题\n\n多行正文，含中文与符号 —— 逐字镜像。\n\n```js\nconst x = 1;\n```\n';
    writeSkill(root, 'rich-skill', body, {
      'references/a.md': '# 参考 A\n内容 A。\n',
      'references/nested/b.md': '嵌套参考 B。\n'
    });
    sync(root);
    var mdHashSrc = fs.readFileSync(path.join(root, '.claude/skills/rich-skill/SKILL.md'));
    var mdHashOut = fs.readFileSync(agentsPath(root, 'skills/rich-skill/SKILL.md'));
    ok('3a SKILL.md 正文段逐字节相同（源=镜像，frontmatter 未变时整文件相同）', mdHashSrc.equals(mdHashOut));
    var refA = fs.readFileSync(path.join(root, '.claude/skills/rich-skill/references/a.md'));
    var refAOut = fs.readFileSync(agentsPath(root, 'skills/rich-skill/references/a.md'));
    ok('3b references/a.md 逐字节相同', refA.equals(refAOut));
    var refB = fs.readFileSync(path.join(root, '.claude/skills/rich-skill/references/nested/b.md'));
    var refBOut = fs.readFileSync(agentsPath(root, 'skills/rich-skill/references/nested/b.md'));
    ok('3c 嵌套 references/nested/b.md 逐字节相同', refB.equals(refBOut));
  })();

  // ── 4. denylist skill 不出现在镜像里；非 denylist 出现 ──────────────────
  (function () {
    var root = freshRoot('denylist');
    writeSkill(root, 'webapp-testing', '---\nname: webapp-testing\ndescription: "上游 skill，应被排除"\n---\n\n# X\n');
    writeSkill(root, 'skill-creator', '---\nname: skill-creator\ndescription: "上游 skill，应被排除"\n---\n\n# X\n');
    writeSkill(root, 'my-original-skill', '---\nname: my-original-skill\ndescription: "自研 skill，应被镜像"\n---\n\n# X\n');
    var r = sync(root);
    ok('4a --sync 成功(denylist 不阻塞其余 skill）', r.status === 0, r.out);
    ok('4b webapp-testing 不出现在镜像里', !fs.existsSync(agentsPath(root, 'skills', 'webapp-testing')));
    ok('4c skill-creator 不出现在镜像里', !fs.existsSync(agentsPath(root, 'skills', 'skill-creator')));
    ok('4d my-original-skill 出现在镜像里', fs.existsSync(agentsPath(root, 'skills', 'my-original-skill', 'SKILL.md')));
    var list = run(['--list-shipped-skills', '--root', root]);
    ok('4e --list-shipped-skills 只列出非 denylist skill', list.out.trim() === 'my-original-skill', JSON.stringify(list.out));
  })();

  // ── 5. --check 双向锁:改脏 → exit 1 点名文件;--sync 后再 --check → exit 0 ──
  (function () {
    var root = freshRoot('check-roundtrip');
    writeSkill(root, 'a-skill', '---\nname: a-skill\ndescription: "desc"\n---\n\n# Body\n', {
      'references/r.md': 'ref\n'
    });
    var cBefore = check(root);
    ok('5a 未 --sync 前 --check 检测出缺失（exit 1）', cBefore.status === 1, 'status=' + cBefore.status);
    sync(root);
    var cAfterSync = check(root);
    ok('5b --sync 后 --check → exit 0（新 case 生效）', cAfterSync.status === 0, cAfterSync.out);
    fs.writeFileSync(agentsPath(root, 'skills/a-skill/SKILL.md'), '手改脏的内容\n');
    var cDirty = check(root);
    ok('5c 手改镜像后 --check → exit 1', cDirty.status === 1, 'status=' + cDirty.status);
    ok('5d diff 摘要点名被改脏的文件路径', /skills\/a-skill\/SKILL\.md/.test(cDirty.out), cDirty.out);
    sync(root);
    var cRestored = check(root);
    ok('5e 重新 --sync 后 --check 再次 → exit 0（原 case 仍过，双向锁闭环）', cRestored.status === 0, cRestored.out);
  })();

  // ── 6. 防御性剔除:hooks/allowed-tools 被删;version/license 保留 ────────
  (function () {
    var root = freshRoot('strip-keys');
    var body = '---\nname: guarded-skill\ndescription: "带 Claude 专属字段"\nversion: 2.0.0\nlicense: MIT\nhooks:\n  onLoad: some-script.js\nallowed-tools:\n  - Bash\n  - Read\ndisallowed-tools:\n  - Write\ncontext: fork\npaths:\n  - src/**\n---\n\n# Body\n';
    writeSkill(root, 'guarded-skill', body);
    sync(root);
    var out = readAgents(root, 'skills/guarded-skill/SKILL.md');
    ok('6a hooks 字段被剔除', !/^hooks:/m.test(out), out.slice(0, 300));
    ok('6b allowed-tools 字段被剔除', !/^allowed-tools:/m.test(out));
    ok('6c disallowed-tools 字段被剔除', !/^disallowed-tools:/m.test(out));
    ok('6d context 字段被剔除', !/^context:/m.test(out));
    ok('6e paths 字段被剔除', !/^paths:/m.test(out));
    ok('6f version 字段保留', /^version: 2\.0\.0$/m.test(out));
    ok('6g license 字段保留', /^license: MIT$/m.test(out));
    ok('6h name/description 仍在', /^name: guarded-skill$/m.test(out) && /^description:/m.test(out));
  })();

  // ── 7. --sync 幂等/确定性:两次跑字节相同(设计稿 §3.C「跨次运行字节相同」)──
  (function () {
    var root = freshRoot('determinism');
    writeSkill(root, 'det-skill', '---\ndescription: "跑两次应字节相同"\n---\n\n# Body\n正文。\n', {
      'references/x.md': '参考。\n'
    });
    sync(root);
    var snap1 = fs.readFileSync(agentsPath(root, 'skills/det-skill/SKILL.md'));
    var snapRef1 = fs.readFileSync(agentsPath(root, 'skills/det-skill/references/x.md'));
    sync(root);
    var snap2 = fs.readFileSync(agentsPath(root, 'skills/det-skill/SKILL.md'));
    var snapRef2 = fs.readFileSync(agentsPath(root, 'skills/det-skill/references/x.md'));
    ok('7a 两次 --sync 后 SKILL.md 字节相同', snap1.equals(snap2));
    ok('7b 两次 --sync 后 references 字节相同', snapRef1.equals(snapRef2));
  })();

  // ── 8. GENERATED.md provenance 文件存在 ─────────────────────────────────
  (function () {
    var root = freshRoot('provenance');
    writeSkill(root, 's', '---\ndescription: "d"\n---\n\n# B\n');
    sync(root);
    ok('8a .agents/GENERATED.md 生成', fs.existsSync(agentsPath(root, 'GENERATED.md')));
    var g = readAgents(root, 'GENERATED.md');
    ok('8b GENERATED.md 说明勿手改 + 真相源指向 .claude/skills/', /勿手改/.test(g) && /\.claude\/skills/.test(g));
  })();

  // ── 9. 用法错误 → exit 2 ────────────────────────────────────────────────
  (function () {
    var r = run([]);
    ok('9a 不带任何模式参数 → exit 2', r.status === 2, 'status=' + r.status);
    var r2 = run(['--bogus']);
    ok('9b 未知参数 → exit 2', r2.status === 2, 'status=' + r2.status);
  })();

  // ── 10. 真实仓库树 --check → exit 0(设计稿决策 G #1:node test/run.cjs 全绿
  //        的定义里就含"Codex 镜像已与 .claude/skills 同步"，漂移即红，不是
  //        只测工具逻辑、也测「提交进库的 .agents/ 真的没漂移」这件事本身）。
  (function () {
    var engineRoot = path.join(__dirname, '..', '..', '..'); // test/ → tooling → core → engine/
    var real = check(engineRoot);
    ok('10a 真实仓库 .agents/ 与 .claude/skills/ 一致(漂移需先 --sync 再提交)', real.status === 0, real.out);
    var agents = fs.readFileSync(path.join(engineRoot, 'AGENTS.md'), 'utf8');
    ok('10b AGENTS 给 Codex 明确的 src/ 复制命令',
      /Copy-Item examples\/text-adventure-demo\/world\.js/.test(agents) && /cp examples\/text-adventure-demo\/\{world\.js,game\.js,index\.html\} src\//.test(agents));
    ok('10c AGENTS 禁止把 examples 当新游戏工位', /examples\/.*只读教材/.test(agents) && /不得直接修改、审计或重建 demo/.test(agents));
    var skill = fs.readFileSync(path.join(engineRoot, '.agents', 'skills', 'text-adventure-game', 'SKILL.md'), 'utf8');
    ok('10d Codex skill 把用户规模写成硬上限并提供短原型 fast path',
      /规模服从用户/.test(skill) && /≤8 节点短原型 fast path/.test(skill) && /额外创建未要求的 `canon\.md`/.test(skill));
  })();

  // ── 11. 解析器 fail-loud(§5 加固,反向变异三向锁):合法但非规范的 frontmatter
  //        顶层行(冒号前空格 / 引号包裹 key)→ --sync 非零报错,而非静默吸收(泄漏
  //        Claude 专属字段)或误判缺字段;规范写法仍过、规范 hooks 仍被剔除。──────
  (function () {
    var r1 = freshRoot('parser-space-colon');
    writeSkill(r1, 'sp', '---\nname: sp\ndescription: d\nhooks       : {onStart: "x"}\n---\n\n# B\n');
    var s1 = sync(r1);
    ok('11a 冒号前空格顶层行 → --sync 非零 fail-loud', s1.status !== 0 && s1.status !== null, 'status=' + s1.status);
    ok('11b 报错指向「规范 key: value」修法', /规范/.test(s1.out) && /key: value/.test(s1.out), s1.out);
    ok('11c fail-loud 不留半成品镜像', !fs.existsSync(agentsPath(r1, 'skills', 'sp')), '');

    var r2 = freshRoot('parser-quoted-key');
    writeSkill(r2, 'qk', '---\nname: qk\n"description": valid quoted\n---\n\n# B\n');
    var s2 = sync(r2);
    ok('11d 引号包裹 key → --sync 非零 fail-loud', s2.status !== 0 && s2.status !== null, 'status=' + s2.status);
    ok('11e 引号 key 报「不是规范」而非旧的「缺 description」误判', /不是规范/.test(s2.out), s2.out);

    var r3 = freshRoot('parser-canonical');
    writeSkill(r3, 'cn', '---\nname: cn\ndescription: ok\nhooks: {onStart: "x"}\n---\n\n# B\n');
    var s3 = sync(r3);
    ok('11f 规范 frontmatter → --sync 正常 0(加固不误伤原 case)', s3.status === 0, s3.out);
    var m3 = readAgents(r3, 'skills/cn/SKILL.md');
    ok('11g 规范 hooks 仍被 STRIP_KEYS 剔除', !/^hooks:/m.test(m3), m3.slice(0, 200));

    var r4 = freshRoot('parser-comment');
    writeSkill(r4, 'cm', '---\n# 顶层注释\nname: cm\n\ndescription: d\n---\n\n# B\n');
    var s4 = sync(r4);
    ok('11h 顶层注释 + 空行不误触发 fail-loud', s4.status === 0, s4.out);
  })();

  // ── 12. denylist 大小写不敏感(§5 加固):大小写变体的上游 skill 名仍被排除,
  //        防 `WebApp-Testing` 这类合法变体绕过排除;--sync 打 skipped 日志消静默。──
  (function () {
    var root = freshRoot('denylist-case');
    writeSkill(root, 'WebApp-Testing', '---\nname: WebApp-Testing\ndescription: "上游变体大小写"\n---\n\n# X\n');
    writeSkill(root, 'Skill-Creator', '---\nname: Skill-Creator\ndescription: "上游变体大小写"\n---\n\n# X\n');
    writeSkill(root, 'keep-me', '---\nname: keep-me\ndescription: "自研,应镜像"\n---\n\n# X\n');
    var r = sync(root);
    ok('12a --sync 成功', r.status === 0, r.out);
    ok('12b WebApp-Testing(大小写变体)被排除', !fs.existsSync(agentsPath(root, 'skills', 'WebApp-Testing')));
    ok('12c Skill-Creator(大小写变体)被排除', !fs.existsSync(agentsPath(root, 'skills', 'Skill-Creator')));
    ok('12d 自研 keep-me 仍镜像', fs.existsSync(agentsPath(root, 'skills', 'keep-me', 'SKILL.md')));
    var list = run(['--list-shipped-skills', '--root', root]);
    ok('12e --list-shipped-skills 只列自研 skill', list.out.trim() === 'keep-me', JSON.stringify(list.out));
    ok('12f --sync 打 skipped 日志(消 finding 9 的静默)', /跳过/.test(r.out) && /WebApp-Testing/.test(r.out), r.out);
  })();

  // ── 13. --list-denied-skills(单一真相源出口:package-engine/release.yml 取 exclude)─
  (function () {
    var r = run(['--list-denied-skills']);
    ok('13a --list-denied-skills → exit 0', r.status === 0, 'status=' + r.status);
    var names = r.out.trim().split(/\r?\n/).sort();
    ok('13b 打印 denylist = skill-creator + webapp-testing', names.join(',') === 'skill-creator,webapp-testing', JSON.stringify(r.out));
  })();
} finally {
  fs.rmSync(TMP_BASE, { recursive: true, force: true });
}

console.log('\n结果: ' + pass + ' 通过, ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
