#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────
 * PreToolUse hook — 保护类型无关核心 engine-core.js 不被编辑
 * ─────────────────────────────────────────────────────────────
 * 为什么用 hook 而非只靠 rules:「修改分层」的核心铁律「engine-core.js 不碰」
 *   是离散可检的安全门——弱模型做复杂游戏时可能忘掉、直接改核心去「修 bug」,
 *   一改就把类型无关核心耦合到具体玩法(违背整个架构)。规则是建议、能背诵
 *   ≠ 会遵守(社区共识 GitHub #43557/#57200);能用代码物理强制的就强制。
 *
 * 触发:settings.json 把本 hook 挂在 PreToolUse、matcher = Edit|Write|MultiEdit。
 *   Claude Code 在工具执行【前】喂 stdin JSON(官方 hooks.md):
 *   顶层 tool_name / tool_input / cwd…;Edit/Write/MultiEdit 的目标路径在
 *   tool_input.file_path。
 *
 * 判据:路径 basename === 'engine-core.js' → exit 2 阻断 + stderr 回灌(模型可见)。
 *   用 basename(归一化 \ → /)而非全路径匹配:覆盖 core/runtime/engine-core.js
 *   及任何引用形式,简单稳。其余路径 exit 0 放行。
 * 退出码(官方 PreToolUse 语义):exit 2 = 阻断该工具调用、stderr 回灌给 Claude;
 *   exit 0 = 放行(走正常权限流);其他非零 = 只记调试日志、不阻断。
 * fail-open:stdin 解析不了 / 无 file_path → exit 0(不误拦非编辑场景)。
 * 为什么 Node:Claude Code 全平台自带 node;免 bash/jq/CRLF/shebang 坑
 *   (与 session-start / pre-stop-audit 等既有 hook 同一约定)。
 * ───────────────────────────────────────────────────────────── */
import fs from 'fs';
import path from 'path';

let input = '';
try { input = fs.readFileSync(0, 'utf8'); } catch (e) { input = ''; }

let fp = '';
try {
  const data = JSON.parse(input || '{}');
  fp = (data.tool_input && data.tool_input.file_path) || '';
} catch (e) { process.exit(0); } // 无效 JSON → 放行(fail-open)

if (fp) {
  const base = path.basename(String(fp).replace(/\\/g, '/'));
  if (base === 'engine-core.js') {
    process.stderr.write('⛔ engine-core.js 是类型无关核心,不可编辑。改玩法→模块(modules/);改内容→world.js;改表现→presenter(presenters/)。核心不碰是「修改分层」铁律(见 SKILL / 修改分层指引)。\n');
    process.exit(2);
  }
}
process.exit(0);
