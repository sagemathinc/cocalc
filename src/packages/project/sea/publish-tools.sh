#!/usr/bin/env bash
set -Eeuo pipefail

NAME="cocalc-project-tools"
VERSION="$(node -p "require('../package.json').version")"
BUILD_DIR="../build"
ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac
TARGET="tools-${OS}-${ARCH}.tar.xz"
FILE="${BUILD_DIR}/${TARGET}"

if [ ! -f "$FILE" ]; then
  echo "Tools artifact not found: $FILE" >&2
  echo "Run: pnpm --filter @cocalc/project build:tools" >&2
  exit 1
fi

LATEST_KEY="${COCALC_R2_LATEST_KEY:-software/tools/latest-${OS}-${ARCH}.json}"
PREFIX="${COCALC_R2_PREFIX:-software/tools/$VERSION}"

node ../../cloud/scripts/publish-r2.js \
  --file "$FILE" \
  --bucket "${COCALC_R2_BUCKET:-}" \
  --prefix "$PREFIX" \
  --latest-key "$LATEST_KEY" \
  --public-base-url "${COCALC_R2_PUBLIC_BASE_URL:-}" \
  --os "$OS" \
  --arch "$ARCH"
