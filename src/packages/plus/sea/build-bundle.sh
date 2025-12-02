#!/usr/bin/env bash

# Build a compact Node bundle for CoCalc Plus using @vercel/ncc.
#
# Usage:
#   ./build-bundle.sh [output-directory]
#
# The script expects pnpm v8+ and Node 18+ (Node 24 for runtime).
# It runs the package build for @cocalc/plus, bundles the entry point
# packages/plus/bin/start.js (delegating to @cocalc/lite/main),
# and copies the static frontend assets.
#
# Native addons copied by ncc (e.g. zeromq, node-pty) are preserved.
# Additional assets can be copied after this script if needed.

set -euo pipefail

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT="${1:-$ROOT/packages/plus/build/bundle}"

echo "WARNING: be sure to 'cd static && pnpm clean && pnpm install && pnpm build' to reset the static content!"

echo "Building CoCalc Plus bundle..."
echo "  root: $ROOT"
echo "  out : $OUT"

mkdir -p "$OUT"
rm -rf "$OUT"/*

cd "$ROOT"

echo "- Bundle entry point with @vercel/ncc"
ncc build packages/plus/bin/start.js \
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

echo "- Copy node-pty native addon for current platform"
case "${OSTYPE}" in
  linux*)
    case "$(uname -m)" in
      x86_64) copy_native_pkg "@lydell/node-pty-linux-x64" ;;
      aarch64|arm64) copy_native_pkg "@lydell/node-pty-linux-arm64" ;;
      *) echo "  (unsupported linux arch for node-pty: $(uname -m))" ;;
    esac
    ;;
  darwin*)
    case "$(uname -m)" in
      x86_64) copy_native_pkg "@lydell/node-pty-darwin-x64" ;;
      arm64) copy_native_pkg "@lydell/node-pty-darwin-arm64" ;;
      *) echo "  (unsupported darwin arch for node-pty: $(uname -m))" ;;
    esac
    ;;
  *)
    echo "  (unsupported platform for node-pty: ${OSTYPE})"
    ;;
esac

copy_native_pkg "bufferutil"
copy_native_pkg "utf-8-validate"

echo "- Copy static frontend assets"
mkdir -p "$OUT"/static
rsync -a --delete \
  --exclude '*.map' \
  --exclude 'embed-*.js' \
  packages/static/dist/ "$OUT/static/"

echo "- Remove other platform binaries"

case "${OSTYPE}" in
  linux*)
    rm -rf "$OUT"/build/win32 "$OUT"/build/darwin
    ;;
  darwin*)
    rm -rf "$OUT"/build/win32 "$OUT"/build/linux
    ;;
esac

echo "- Bundle created at $OUT"
