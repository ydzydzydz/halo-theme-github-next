#!/usr/bin/env bash
set -euo pipefail
# 未匹配到任何文件时，glob 结果为空数组而不是字面量路径
shopt -s nullglob

THEME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$THEME_DIR" ]]; then
  echo "Theme directory was not found at $THEME_DIR" >&2
  exit 1
fi

if [[ ! -f "$THEME_DIR/package.json" ]]; then
  echo "package.json was not found in $THEME_DIR" >&2
  exit 1
fi

if ! command -v corepack >/dev/null 2>&1; then
  echo "corepack was not found in PATH, cannot run pnpm through corepack" >&2
  echo "请先执行 corepack enable（需要 Node.js 20+），或直接使用已安装的 pnpm" >&2
  exit 1
fi

cd "$THEME_DIR"
exec corepack pnpm dev
