#!/usr/bin/env bash
set -Eeuo pipefail

NAME="cocalc-project-bundle"
VERSION="$(node -p "require('../package.json').version")"
BUILD_DIR="../build"
TARGET="bundle.tar.xz"
FILE="${BUILD_DIR}/${TARGET}"

if [ ! -f "$FILE" ]; then
  echo "Bundle artifact not found: $FILE" >&2
  echo "Run: pnpm --filter @cocalc/project build:tarball" >&2
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
