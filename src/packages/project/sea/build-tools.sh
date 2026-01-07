#!/usr/bin/env bash
set -Eeuo pipefail

# Build a tools tarball containing the project host helper binaries
# (dropbear, rg, rustic, etc.) from the local build output.
#
# Usage:
#   ./build-tools.sh [output-directory]
#
# The script expects packages/backend/node_modules/.bin to exist and emits
# packages/project/build/tools-<os>-<arch>.tar.xz by default.

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT_DIR="${1:-$ROOT/packages/project/build}"
BIN_SRC="$ROOT/packages/backend/node_modules/.bin"
WORK_DIR="$OUT_DIR/tools"
ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac
TARGET="$OUT_DIR/tools-${OS}-${ARCH}.tar.xz"

echo "Building CoCalc tools bundle..."
echo "  root: $ROOT"
echo "  out : $OUT_DIR"

if [ ! -d "$BIN_SRC" ]; then
  echo "Tools bin directory not found: $BIN_SRC" >&2
  echo "Run: pnpm --filter @cocalc/backend build (or install-sandbox-tools)." >&2
  exit 1
fi

if [ ! -x "$BIN_SRC/sshpiperd" ]; then
  echo "sshpiperd not found; installing via @cocalc/backend/sandbox/install"
  node -e 'require("@cocalc/backend/sandbox/install").install("sshpiper")'
fi

rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"
cp -a "$BIN_SRC" "$WORK_DIR"/bin

rm -f "$TARGET"
tar -C "$WORK_DIR" -Jcf "$TARGET" bin

echo "- Tools bundle created at $TARGET"
