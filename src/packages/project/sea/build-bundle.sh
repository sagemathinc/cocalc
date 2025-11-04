#!/usr/bin/env bash

# Build a compact Node bundle for the CoCalc project daemon using @vercel/ncc.
#
# Usage:
#   ./build-bundle.sh [output-directory]
#
# The script emits the bundle in packages/project/build/bundle by default.
# It bundles the runtime entry point, copies required native modules and
# supporting assets, and prepares the directory so it can be archived and
# embedded into the SEA executable.

set -euo pipefail

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT="${1:-$ROOT/packages/project/build/bundle}"

echo "Building CoCalc Project bundle..."
echo "  root: $ROOT"
echo "  out : $OUT"

rm -rf "$OUT"
mkdir -p "$OUT"

cd "$ROOT"

echo "- Bundle entry point with @vercel/ncc"
ncc build packages/project/bin/cocalc-project.js \
  -o "$OUT"/bundle \
  --source-map \
  --external bufferutil \
  --external utf-8-validate

# 2. Generate a minimal package.json (needed for packageDirectory) and copy assets
export ROOT OUT
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.ROOT;
const outDir = process.env.OUT;
if (!root || !outDir) {
  throw new Error("ROOT and OUT must be defined");
}

const srcPkg = require(path.join(root, "packages/project/package.json"));
const bundlePkg = {
  name: "@cocalc/project-bundle",
  private: true,
  version: srcPkg.version
};

fs.writeFileSync(
  path.join(outDir, "bundle", "package.json"),
  JSON.stringify(bundlePkg, null, 2)
);
NODE

# Copy zeromq native manifest/build artefacts expected at runtime (via @cocalc/jupyter)
ZEROMQ_BUILD=$(find packages -path "*node_modules/zeromq/build" -type d -print -quit || true)
if [ -n "$ZEROMQ_BUILD" ]; then
  echo "- Copy zeromq native build artefacts"
  mkdir -p "$OUT"/bundle/build
  cp -r "$ZEROMQ_BUILD/"* "$OUT"/bundle/build/
  mkdir -p "$OUT"/build
  cp -r "$ZEROMQ_BUILD/"* "$OUT"/build/
else
  echo "  (zeromq build directory not found; skipping copy)"
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

# Trim native builds for other platforms to keep output lean
case "${OSTYPE}" in
  linux*)
    rm -rf "$OUT"/bundle/node_modules/@lydell/node-pty-darwin-* || true
    ;;
  darwin*)
    rm -rf "$OUT"/bundle/node_modules/@lydell/node-pty-linux-* || true
    ;;
esac

if [ -d "$OUT"/build ]; then
  case "${OSTYPE}" in
    linux*)
      rm -rf "$OUT"/build/darwin "$OUT"/build/win32
      ;;
    darwin*)
      rm -rf "$OUT"/build/linux "$OUT"/build/win32
      ;;
  esac
fi

echo "- Copy project bin scripts"
mkdir -p "$OUT"/src/packages/cocalc-project
cp -r packages/project/bin "$OUT"/src/packages/cocalc-project/

echo "- Copy backend tool binaries"
BACKEND_BIN="packages/backend/node_modules/.bin"
if [ -d "$BACKEND_BIN" ]; then
  mkdir -p "$OUT"/bin
  cp -a "$BACKEND_BIN"/. "$OUT"/bin/
else
  echo "  (backend .bin directory not found; skipping)"
fi

echo "- Bundle created at $OUT"
