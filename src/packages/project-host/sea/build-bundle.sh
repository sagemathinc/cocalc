#!/usr/bin/env bash

# Build a compact Node bundle for the CoCalc project host using @vercel/ncc.
# This bundles the CLI entry point, copies required native modules, pulls in
# the project-runner templates, and stages static frontend assets so the SEA
# build can embed everything into a single archive.
#
# Usage:
#   ./build-bundle.sh [output-directory]
#
# You should have already installed workspace dependencies. The script will
# build the TypeScript sources for @cocalc/project-host and the static assets.

set -euo pipefail

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT="${1:-$ROOT/packages/project-host/build/bundle}"

echo "Building CoCalc Project Host bundle..."
echo "  root: $ROOT"
echo "  out : $OUT"

mkdir -p "$OUT"
rm -rf "$OUT"/*

cd "$ROOT"

echo "- Build project-host"
pnpm --filter @cocalc/project-host run build

echo "- Build static assets (@cocalc/static)"
pnpm --filter @cocalc/static run build

echo "- Bundle entry point with @vercel/ncc"
ncc build packages/project-host/bin/start.js \
  -o "$OUT"/bundle \
  --source-map \
  --external bufferutil \
  --external utf-8-validate

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

echo "- Copy project-runner templates"
mkdir -p "$OUT"/bundle/templates
cp -r packages/project-runner/templates/. "$OUT"/bundle/templates/

echo "- Copy static frontend assets"
mkdir -p "$OUT"/static
rsync -a --delete \
  --exclude '*.map' \
  --exclude 'embed-*.js' \
  packages/static/dist/ "$OUT/static/"

echo "- Remove other platform binaries"
case "${OSTYPE}" in
  linux*)
    rm -rf "$OUT"/bundle/node_modules/@lydell/node-pty-darwin-* || true
    ;;
  darwin*)
    rm -rf "$OUT"/bundle/node_modules/@lydell/node-pty-linux-* || true
    ;;
esac

echo "- Bundle created at $OUT"
