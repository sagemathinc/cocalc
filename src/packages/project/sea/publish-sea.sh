#!/usr/bin/env bash
set -Eeuo pipefail

NAME="cocalc-project"
VERSION="$(node -p "require('../package.json').version")"
ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac
SEA_DIR="../build/sea"
TARGET="${NAME}-${VERSION}-${ARCH}-${OS}.tar.xz"
FILE="${SEA_DIR}/${TARGET}"

if [ ! -f "$FILE" ]; then
  echo "SEA artifact not found: $FILE" >&2
  echo "Run: pnpm run sea" >&2
  exit 1
fi

LATEST_KEY="${COCALC_R2_LATEST_KEY:-software/project/latest-${OS}-${ARCH}.json}"
PREFIX="${COCALC_R2_PREFIX:-software/project/$VERSION}"

node ../../cloud/scripts/publish-r2.js \
  --file "$FILE" \
  --bucket "${COCALC_R2_BUCKET:-}" \
  --prefix "$PREFIX" \
  --latest-key "$LATEST_KEY" \
  --public-base-url "${COCALC_R2_PUBLIC_BASE_URL:-}" \
  --os "$OS" \
  --arch "$ARCH"
