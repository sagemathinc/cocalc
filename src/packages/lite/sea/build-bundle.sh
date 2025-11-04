#!/usr/bin/env bash

# Build a compact Node bundle for CoCalc Lite using @vercel/ncc.
#
# Usage:
#   ./build-bundle.sh [output-directory]
#
# The script expects pnpm v8+ and Node 18+ (Node 24 for runtime).
# It runs the package build for @cocalc/lite, bundles the entry point
# packages/lite/bin/start.js (which calls @cocalc/lite/main),
# and copies the static frontend assets.
#
# Native addons copied by ncc (e.g. zeromq, better-sqlite3) are preserved.
# Additional assets can be copied after this script if needed.

set -euo pipefail

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT="${1:-$ROOT/packages/lite/build/bundle}"

echo "Building CoCalc Lite bundle..."
echo "  root: $ROOT"
echo "  out : $OUT"

mkdir -p "$OUT"
rm -rf "$OUT"/*

cd "$ROOT"

echo "- Bundle entry point with @vercel/ncc"
ncc build packages/lite/bin/start.js \
  -o "$OUT"/bundle \
  --source-map \
  --external bufferutil \
  --external utf-8-validate

# zeromq expects its build manifest next to the native addon; ncc copies the
# compiled .node file but not the manifest.json, so copy it manually.
# Ensure zeromq native addon files are available where the loader expects them.
ZEROMQ_BUILD=$(find packages -path "*node_modules/zeromq/build" -type d -print -quit || true)
if [ -n "$ZEROMQ_BUILD" ]; then
  mkdir -p "$OUT"/bundle/build
  cp -r "$ZEROMQ_BUILD/"* "$OUT"/bundle/build/
  # zeromq looks for ../build relative to the bundle root, so mirror it there too.
  mkdir -p "$OUT"/build
  cp -r "$ZEROMQ_BUILD/"* "$OUT"/build/
else
  echo "zeromq build directory not found; skipping copy"
fi

echo "- Copy node-pty native addon for current platform"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64) NODE_PTY_PKG="@lydell/node-pty-linux-x64" ;;
  aarch64|arm64) NODE_PTY_PKG="@lydell/node-pty-linux-arm64" ;;
  *)
    echo "Unsupported architecture for node-pty: $ARCH"
    NODE_PTY_PKG=""
    ;;
esac
if [ -n "$NODE_PTY_PKG" ]; then
  NODE_PTY_DIR=$(find packages -path "*node_modules/${NODE_PTY_PKG}" -type d -print -quit || true)
  if [ -n "$NODE_PTY_DIR" ]; then
    mkdir -p "$OUT"/bundle/node_modules/"$NODE_PTY_PKG"
    cp -r "$NODE_PTY_DIR"/. "$OUT"/bundle/node_modules/"$NODE_PTY_PKG"/
  else
    echo "node-pty native addon directory not found; skipping copy"
  fi
fi

copy_native_pkg() {
  local pkg="$1"
  local dir
  dir=$(find packages -path "*node_modules/${pkg}" -type d -print -quit || true)
  if [ -n "$dir" ]; then
    echo "- Copy native module ${pkg}"
    mkdir -p "$OUT"/bundle/node_modules/"$pkg"
    cp -r "$dir"/. "$OUT"/bundle/node_modules/"$pkg"/
  else
    echo "  (skipping ${pkg}; not found)"
  fi
}

copy_native_pkg "bufferutil"
copy_native_pkg "utf-8-validate"

echo "- Copy static frontend assets"
mkdir -p "$OUT"/static
rsync -a --delete \
  --exclude '*.map' \
  --exclude 'embed-*.js' \
  packages/static/dist/ "$OUT/static/"

echo "- Remove other platform binaries"

if [[ "$OSTYPE" == "linux"* ]]; then
   rm -rf "$OUT"/build/win32 "$OUT"/build/darwin
elif [[ "$OSTYPE" == "darwin"* ]]; then
   rm -rf "$OUT"/build/win32 "$OUT"/build/linux
fi

echo "- Bundle created at $OUT"
