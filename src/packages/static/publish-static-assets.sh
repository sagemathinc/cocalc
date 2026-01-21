#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="$(node -p "require('./package.json').version")"
SOURCE_DIR="${COCALC_STATIC_SOURCE:-dist}"
SHARE_HTML="${SOURCE_DIR}/share.html"

if [ ! -f "$SHARE_HTML" ]; then
  echo "Static assets not found: $SHARE_HTML" >&2
  echo "Run: pnpm --filter @cocalc/static build" >&2
  exit 1
fi

PREFIX="${COCALC_R2_PREFIX:-software/static/$VERSION}"
LATEST_KEY="${COCALC_R2_LATEST_KEY:-software/static/latest.json}"
MANIFEST_KEY="${COCALC_R2_MANIFEST_KEY:-${PREFIX}/manifest.json}"

node ../cloud/scripts/publish-static-assets.mjs \
  --source "$SOURCE_DIR" \
  --bucket "${COCALC_R2_BUCKET:-}" \
  --prefix "$PREFIX" \
  --latest-key "$LATEST_KEY" \
  --manifest-key "$MANIFEST_KEY" \
  --version "$VERSION" \
  --public-base-url "${COCALC_R2_PUBLIC_BASE_URL:-}"
