#!/usr/bin/env bash
set -euo pipefail

THEME_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$(cd "$THEME_DIR/.." && pwd)"
HALO_DIR="$WORKSPACE_DIR/halo"
HALO_WORK_DIR="$WORKSPACE_DIR/.halo-dev"
GRADLE_BIN="$WORKSPACE_DIR/.gradle-dist/gradle-9.6.1/bin/gradle"
GRADLE_INIT_SCRIPT="$WORKSPACE_DIR/.gradle-init.gradle"
JDK_HOMES=("$WORKSPACE_DIR"/.jdks/jdk-21/*.jdk/Contents/Home)
LOCAL_JAVA_HOME="${JDK_HOMES[0]}"

if [[ ! -x "$LOCAL_JAVA_HOME/bin/java" ]]; then
  echo "JDK 21 was not found at $LOCAL_JAVA_HOME" >&2
  exit 1
fi

if [[ ! -x "$GRADLE_BIN" ]]; then
  echo "Gradle 9.6.1 was not found at $GRADLE_BIN" >&2
  exit 1
fi

mkdir -p "$HALO_WORK_DIR/themes"
THEME_LINK="$HALO_WORK_DIR/themes/theme-github-next"

if [[ -e "$THEME_LINK" && ! -L "$THEME_LINK" ]]; then
  mv "$THEME_LINK" "$THEME_LINK.backup-$(date +%Y%m%d%H%M%S)"
fi

ln -sfn "$THEME_DIR" "$THEME_LINK"

export JAVA_HOME="$LOCAL_JAVA_HOME"
export PATH="$JAVA_HOME/bin:$PATH"

cd "$HALO_DIR"
exec "$GRADLE_BIN" --init-script "$GRADLE_INIT_SCRIPT" "$@" :application:bootRun \
  --args="--halo.work-dir=$HALO_WORK_DIR --spring.thymeleaf.cache=false"
