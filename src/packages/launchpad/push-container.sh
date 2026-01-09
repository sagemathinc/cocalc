#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PODMAN_BIN="${PODMAN_BIN:-podman}"
IMAGE_NAME="${IMAGE_NAME:-cocalc-launchpad}"
REGISTRY="${REGISTRY:-gcr.io}"
GCR_PROJECT="${GCR_PROJECT:-}"
IMAGE_TAG="${IMAGE_TAG:-$(node -p "require('./package.json').version")}"

if [[ -z "$GCR_PROJECT" ]]; then
  echo "GCR_PROJECT is required (e.g. export GCR_PROJECT=my-gcp-project)." >&2
  exit 1
fi

IMAGE_REF="${REGISTRY}/${GCR_PROJECT}/${IMAGE_NAME}:${IMAGE_TAG}"

"$PODMAN_BIN" push "$IMAGE_REF"

echo "Pushed ${IMAGE_REF}"
