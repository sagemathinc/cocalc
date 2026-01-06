#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLOUD_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUT_DIR="$CLOUD_DIR/build/connector"

VERSION="${CONNECTOR_VERSION:-$(node -p "require('${CLOUD_DIR}/package.json').version")}"
NAME="cocalc-self-host-connector"

mkdir -p "$OUT_DIR"

build_target() {
  local goos="$1"
  local goarch="$2"
  local target="$OUT_DIR/${NAME}-${VERSION}-${goos}-${goarch}"

  echo "Building $target"
  env CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
    go build -trimpath -ldflags "-s -w -X main.version=${VERSION}" -o "$target" .

  if [[ "$goos" == "darwin" ]]; then
    if command -v codesign >/dev/null 2>&1; then
      codesign --force --sign - "$target"
    else
      echo "codesign not found; skipping macOS signing for $target" >&2
    fi
  fi
}

build_target linux amd64
build_target linux arm64
build_target darwin arm64

ls -lh "$OUT_DIR"
echo "Built connector binaries in $OUT_DIR"
