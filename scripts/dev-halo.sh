#!/usr/bin/env bash
set -euo pipefail
# 未匹配到任何文件时，glob 结果为空数组而不是字面量路径
shopt -s nullglob

THEME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$THEME_DIR/.." && pwd)"
HALO_DIR="$WORKSPACE_DIR/halo"
HALO_WORK_DIR="$WORKSPACE_DIR/.halo-dev"
# 可通过 GRADLE_BIN 环境变量覆盖，默认使用工作区内的 Gradle 发行版
GRADLE_BIN="${GRADLE_BIN:-$WORKSPACE_DIR/.gradle-dist/gradle-9.6.1/bin/gradle}"
GRADLE_INIT_SCRIPT="$WORKSPACE_DIR/.gradle-init.gradle"
JDK_HOMES=("$WORKSPACE_DIR"/.jdks/jdk-21/*.jdk/Contents/Home)
BACKUP_KEEP=3

if (( ${#JDK_HOMES[@]} == 0 )); then
  echo "JDK 21 was not found under $WORKSPACE_DIR/.jdks/jdk-21" >&2
  exit 1
fi

LOCAL_JAVA_HOME="${JDK_HOMES[0]}"

if [[ ! -x "$LOCAL_JAVA_HOME/bin/java" ]]; then
  echo "JDK 21 was not found at $LOCAL_JAVA_HOME" >&2
  exit 1
fi

if [[ ! -x "$GRADLE_BIN" ]]; then
  echo "Gradle was not found at $GRADLE_BIN" >&2
  echo "请安装 Gradle 9.6.1 到 $WORKSPACE_DIR/.gradle-dist/gradle-9.6.1，或通过 GRADLE_BIN 环境变量指定可执行文件路径" >&2
  exit 1
fi

if [[ ! -d "$HALO_DIR" ]]; then
  echo "Halo source directory was not found at $HALO_DIR" >&2
  echo "请先将 Halo 2 源码克隆到该目录（https://github.com/halo-dev/halo）后再运行本脚本" >&2
  exit 1
fi

mkdir -p "$HALO_WORK_DIR/themes"
THEME_LINK="$HALO_WORK_DIR/themes/theme-github-next"

if [[ -e "$THEME_LINK" && ! -L "$THEME_LINK" ]]; then
  mv "$THEME_LINK" "$THEME_LINK.backup-$(date +%Y%m%d%H%M%S)"
fi

# 备份目录按时间戳命名，只保留最近 BACKUP_KEEP 份，其余删除
backup_dirs=("$THEME_LINK".backup-*)
if (( ${#backup_dirs[@]} > BACKUP_KEEP )); then
  while IFS= read -r old_backup; do
    [[ -n "$old_backup" ]] || continue
    rm -rf "$old_backup"
    echo "已清理旧备份：$(basename "$old_backup")"
  done < <(printf '%s\n' "${backup_dirs[@]}" | sort -r | tail -n +$((BACKUP_KEEP + 1)))
fi

ln -sfn "$THEME_DIR" "$THEME_LINK"

export JAVA_HOME="$LOCAL_JAVA_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

cd "$HALO_DIR"
exec "$GRADLE_BIN" --init-script "$GRADLE_INIT_SCRIPT" "$@" :application:bootRun \
  --args="--halo.work-dir=$HALO_WORK_DIR --spring.thymeleaf.cache=false"
