#!/usr/bin/env bash

# Build a compact Node bundle for the CoCalc project runner using @vercel/ncc.
#
# Usage:
#   ./build-bundle.sh [output-directory]
#
# The script emits the bundle in packages/project-runner/build/bundle by default.
# It bundles the runtime entry point, copies required native modules and
# supporting assets (like templates), and prepares the directory so it can be
# archived and embedded into the SEA executable.

set -euo pipefail

ROOT="$(realpath "$(dirname "$0")/../../..")"
OUT="${1:-$ROOT/packages/project-runner/build/bundle}"

echo "Building CoCalc Project Runner bundle..."
echo "  root: $ROOT"
echo "  out : $OUT"

rm -rf "$OUT"
mkdir -p "$OUT"

cd "$ROOT"

# 1. Bundle the Node entry point
echo "- Bundle entry point with @vercel/ncc"
ncc build packages/project-runner/bin/start.js \
  -o "$OUT"/bundle \
  --source-map

# 2. Generate a minimal package.json (needed for packageDirectory) and copy templates
export ROOT OUT
node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const root = process.env.ROOT;
const outDir = process.env.OUT;
if (!root || !outDir) {
  throw new Error("ROOT and OUT must be defined");
}

const srcPkg = require(path.join(root, "packages/project-runner/package.json"));
const bundlePkg = {
  name: "@cocalc/project-runner-bundle",
  private: true,
  version: srcPkg.version
};

fs.writeFileSync(
  path.join(outDir, "bundle", "package.json"),
  JSON.stringify(bundlePkg, null, 2)
);
NODE

cp -r packages/project-runner/templates "$OUT"/bundle/templates

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

# 3. Include the platform-specific node-pty binary
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

# 4. Trim native builds for other platforms to keep output lean
case "${OSTYPE}" in
  linux*)
    rm -rf "$OUT"/bundle/node_modules/@lydell/node-pty-darwin-* || true
    ;;
  darwin*)
    rm -rf "$OUT"/bundle/node_modules/@lydell/node-pty-linux-* || true
    ;;
esac

echo "- Bundle created at $OUT"
