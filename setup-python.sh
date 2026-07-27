#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# setup-python.sh — (可选 · 仅外部 skill 需要)检测并配置 Python 3 解释器路径
# ─────────────────────────────────────────────────────────────
# 为什么需要这个(可选):
#   Amatlas 引擎本身零 Python——审计 / Stop hook / 命令全是 Node,无需本脚本。
#   仅当你安装并使用**需要 Python 的外部 skill**(如 Anthropic 官方
#   skill-creator / webapp-testing,见 README『可选扩展』)时才需要 Python 3。
#   本脚本自动检测可用的 Python 3,写入 .claude/python-path 供这类 skill 参考。
#   (Windows 上 `python3` 可能是 Microsoft Store 占位 stub,退出码 49;本脚本绕过它。)
#
# 用法:
#   bash setup-python.sh              # 自动检测
#   bash setup-python.sh /path/to/python  # 手动指定
# ─────────────────────────────────────────────────────────────
set -euo pipefail

OUTFILE=".claude/python-path"
mkdir -p .claude

# 验证一个 Python 路径是否是真正的 Python 3(不是 Store stub)
check_python() {
  local py="$1"
  # 必须能执行且是 Python 3.x
  if "$py" -c "import sys; assert sys.version_info >= (3, 7), 'too old'; print(f'Python {sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null; then
    return 0
  fi
  return 1
}

# 如果用户手动指定了路径
if [ "${1:-}" != "" ]; then
  if check_python "$1"; then
    echo "$1" > "$OUTFILE"
    echo "✅ 已配置: $1 → $OUTFILE"
    exit 0
  else
    echo "❌ '$1' 不是有效的 Python 3 解释器"
    exit 1
  fi
fi

# 自动检测:按优先级尝试
echo "正在检测 Python 3 解释器..."
candidates=(
  "python3"          # Linux/macOS 标准
  "python"           # Windows 常见(如果正确安装)
  "py -3"            # Windows Python Launcher
)

# 也检查常见的 conda/venv 路径
if [ -n "${CONDA_PREFIX:-}" ]; then
  candidates=("$CONDA_PREFIX/bin/python" "$CONDA_PREFIX/python" "${candidates[@]}")
fi
if [ -n "${VIRTUAL_ENV:-}" ]; then
  candidates=("$VIRTUAL_ENV/bin/python" "$VIRTUAL_ENV/Scripts/python" "${candidates[@]}")
fi

found=""
for candidate in "${candidates[@]}"; do
  # 跳过空候选
  [ -z "$candidate" ] && continue
  
  echo -n "  尝试 '$candidate' ... "
  if check_python "$candidate"; then
    found="$candidate"
    echo "✅"
    break
  else
    echo "✗"
  fi
done

if [ -z "$found" ]; then
  echo ""
  echo "❌ 未找到可用的 Python 3 解释器。"
  echo ""
  echo "请安装 Python 3.7+ 后重试,或手动指定:"
  echo "  bash setup-python.sh /full/path/to/python3"
  echo ""
  echo "常见安装方式:"
  echo "  Windows: https://www.python.org/downloads/ (安装时勾选 'Add to PATH')"
  echo "  macOS:   brew install python3"
  echo "  Linux:   sudo apt install python3"
  exit 1
fi

echo "$found" > "$OUTFILE"
echo ""
echo "✅ 已写入: $OUTFILE"
echo "   解释器: $found"
echo ""
echo "hook 和审计脚本将使用此路径。如需更改:"
echo "  方式1: 重跑 bash setup-python.sh"
echo "  方式2: 直接编辑 .claude/python-path (写入完整路径)"
