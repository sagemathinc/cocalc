#!/usr/bin/env bash
set -Eeuo pipefail

ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

STAGING_KEY="${COCALC_R2_STAGING_KEY:-software/project/staging-${OS}-${ARCH}.json}"
LATEST_KEY="${COCALC_R2_LATEST_KEY:-software/project/latest-${OS}-${ARCH}.json}"

node ../../cloud/scripts/publish-r2.js \
  --bucket "${COCALC_R2_BUCKET:-}" \
  --copy-from "$STAGING_KEY" \
  --copy-to "$LATEST_KEY"
