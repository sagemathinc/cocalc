#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$CLOUD_DIR/build/connector"

VERSION="${CONNECTOR_VERSION:-$(node -p "require('${CLOUD_DIR}/package.json').version")}"
NAME="cocalc-self-host-connector"

PUBLISH="${CLOUD_DIR}/scripts/publish-r2.js"
BUCKET="${COCALC_R2_BUCKET:-}"
PUBLIC_BASE_URL="${COCALC_R2_PUBLIC_BASE_URL:-}"
PREFIX_BASE="${COCALC_R2_PREFIX_BASE:-software/self-host/${VERSION}}"
LATEST_BASE="${COCALC_R2_LATEST_KEY_BASE:-software/self-host/latest}"
INSTALL_KEY="${COCALC_R2_INSTALL_KEY:-software/self-host/install.sh}"

if [[ -z "$BUCKET" ]]; then
  echo "COCALC_R2_BUCKET is not set" >&2
  exit 1
fi
if [[ ! -f "$PUBLISH" ]]; then
  echo "publish-r2.js not found at $PUBLISH" >&2
  exit 1
fi

publish_target() {
  local os="$1"
  local arch="$2"
  local file="$3"
  if [[ ! -f "$file" ]]; then
    echo "Missing artifact for ${os}-${arch}: $file" >&2
    return
  fi
  local prefix="${PREFIX_BASE}/${os}-${arch}"
  local latest_key="${LATEST_BASE}-${os}-${arch}.json"

  node "$PUBLISH" \
    --file "$file" \
    --bucket "$BUCKET" \
    --prefix "$prefix" \
    --latest-key "$latest_key" \
    --public-base-url "$PUBLIC_BASE_URL" \
    --os "$os" \
    --arch "$arch"
}

publish_target linux amd64 "$OUT_DIR/${NAME}-${VERSION}-linux-amd64"
publish_target linux arm64 "$OUT_DIR/${NAME}-${VERSION}-linux-arm64"
publish_target darwin arm64 "$OUT_DIR/${NAME}-${VERSION}.pkg"

if [[ -f "$SCRIPT_DIR/install-connector.sh" ]]; then
  node "$PUBLISH" \
    --file "$SCRIPT_DIR/install-connector.sh" \
    --bucket "$BUCKET" \
    --key "$INSTALL_KEY" \
    --public-base-url "$PUBLIC_BASE_URL" \
    --content-type "text/plain" \
    --cache-control "public, max-age=300"
else
  echo "install-connector.sh not found; skipping installer upload" >&2
fi
