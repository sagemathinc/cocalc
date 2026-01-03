#!/usr/bin/env bash
set -Eeuo pipefail

NAME="cocalc-project"
VERSION="$(node -p "require('../package.json').version")"
MACHINE="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
SEA_DIR="../build/sea"
TARGET="${NAME}-${VERSION}-${MACHINE}-${OS}.tar.xz"
FILE="${SEA_DIR}/${TARGET}"

if [ ! -f "$FILE" ]; then
  echo "SEA artifact not found: $FILE" >&2
  echo "Run: pnpm run sea" >&2
  exit 1
fi

LATEST_KEY="${COCALC_R2_LATEST_KEY:-software/project/latest.json}"
PREFIX="${COCALC_R2_PREFIX:-software/project/$VERSION}"

node ../../cloud/scripts/publish-r2.js \
  --file "$FILE" \
  --bucket "${COCALC_R2_BUCKET:-}" \
  --prefix "$PREFIX" \
  --latest-key "$LATEST_KEY" \
  --public-base-url "${COCALC_R2_PUBLIC_BASE_URL:-}"
