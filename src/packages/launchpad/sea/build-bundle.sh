#!/usr/bin/env bash

# Build a compact Node bundle for CoCalc Launchpad using @vercel/ncc.
#
# Usage:
#   ./build-bundle.sh [output-directory]
#
# The script expects pnpm v8+ and Node 18+ (Node 24 for runtime).
# It builds Launchpad plus its runtime dependencies, bundles the CLI entry
# point (packages/launchpad/bin/start.js), and copies static assets,
# Next api/v2 handlers, and PGlite assets.

set -euo pipefail

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT="${1:-$ROOT/packages/launchpad/build/bundle}"

echo "WARNING: be sure to 'cd static && pnpm clean && pnpm install && pnpm build' to reset the static content!"

echo "Building CoCalc Launchpad bundle..."
echo "  root: $ROOT"
echo "  out : $OUT"

mkdir -p "$OUT"
rm -rf "$OUT"/*

cd "$ROOT"

echo "- Build Launchpad runtime dependencies"
pnpm --filter @cocalc/launchpad run build
pnpm --filter @cocalc/database run build
pnpm --filter @cocalc/server run build
pnpm --filter @cocalc/hub run build
pnpm --filter @cocalc/next run ts-build

echo "- Prepare Next lib alias for bundler"
NEXT_DIST="$ROOT/packages/next/dist"
NEXT_LIB_ALIAS_CREATED=""
if [ -d "$NEXT_DIST" ]; then
  mkdir -p "$NEXT_DIST/node_modules"
  if [ ! -e "$NEXT_DIST/node_modules/lib" ]; then
    ln -s ../lib "$NEXT_DIST/node_modules/lib"
    NEXT_LIB_ALIAS_CREATED="1"
  fi
fi

echo "- Bundle entry point with @vercel/ncc"
NODE_PATH="${NODE_PATH:+$NODE_PATH:}$ROOT/packages/next/dist" \
ncc build packages/launchpad/bin/start.js \
  -o "$OUT"/bundle \
  --source-map \
  --external @electric-sql/pglite \
  --external bufferutil \
  --external utf-8-validate

if [ "$NEXT_LIB_ALIAS_CREATED" = "1" ]; then
  rm -f "$NEXT_DIST/node_modules/lib"
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

copy_js_pkg() {
  local pkg="$1"
  local dir
  dir=$(find packages -path "*node_modules/${pkg}" -type d -print -quit || true)
  if [ -n "$dir" ]; then
    echo "- Copy package ${pkg}"
    mkdir -p "$OUT"/bundle/node_modules/"$pkg"
    cp -r "$dir"/. "$OUT"/bundle/node_modules/"$pkg"/
  else
    echo "  (skipping ${pkg}; not found)"
  fi
}

copy_js_pkg "@electric-sql/pglite"

echo "- Copy static frontend assets"
mkdir -p "$OUT"/static
rsync -a --delete \
  --exclude '*.map' \
  --exclude 'embed-*.js' \
  packages/static/dist/ "$OUT/static/"

echo "- Copy Next api/v2 handlers"
mkdir -p "$OUT"/next-dist
rsync -a --delete \
  --exclude '*.map' \
  packages/next/dist/ "$OUT/next-dist/"

echo "- Copy PGlite bundle assets"
PGLITE_DIST=$(find packages -path "*node_modules/@electric-sql/pglite/dist" -type d -print -quit || true)
if [ -n "$PGLITE_DIST" ]; then
  mkdir -p "$OUT"/pglite
  cp "$PGLITE_DIST"/pglite.data "$OUT"/pglite/ || true
  cp "$PGLITE_DIST"/pglite.wasm "$OUT"/pglite/ || true
else
  echo "pglite dist directory not found; skipping copy"
fi

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
