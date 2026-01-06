#!/usr/bin/env bash
set -Eeuo pipefail

BIN="${1:-}"
VERSION="${2:-}"
BASE_NAME="${3:-}"

if [[ -z "$BIN" || -z "$VERSION" ]]; then
  echo "usage: $0 <binary> <version> [base-name]" >&2
  exit 2
fi

if ! command -v codesign >/dev/null 2>&1; then
  echo "codesign not found; cannot sign $BIN" >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTITLEMENTS="${COCALC_ENTITLEMENTS_PLIST:-$SCRIPT_DIR/../../../plus/sea/entitlements.plist}"

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "entitlements plist not found: $ENTITLEMENTS" >&2
  exit 2
fi

TEAM_ID="${COCALC_TEAM_ID:-BVF94G2MB4}"
APP_IDENTITY="${COCALC_CODESIGN_ID:-Developer ID Application: William STEIN (${TEAM_ID})}"
INST_IDENTITY="${COCALC_INSTALLER_ID:-Developer ID Installer: William STEIN (${TEAM_ID})}"
NOTARY_PROFILE="${COCALC_NOTARY_PROFILE:-notary-profile}"

BIN_NAME="$(basename "$BIN")"
INSTALL_NAME="${BASE_NAME:-$BIN_NAME}"
OUT_DIR="$(cd "$(dirname "$BIN")" && pwd)"
PAYLOAD_DIR="$OUT_DIR/payload"
PKG_UNSIGNED="$OUT_DIR/unsigned.pkg"
PKG_SIGNED="$OUT_DIR/${INSTALL_NAME}-${VERSION}.pkg"

echo "Signing $BIN with ${APP_IDENTITY}"
codesign --force --sign "$APP_IDENTITY" \
  --options runtime \
  --entitlements "$ENTITLEMENTS" \
  "$BIN"
codesign --verify --deep --strict --verbose=2 "$BIN"

rm -rf "$PAYLOAD_DIR" "$PKG_UNSIGNED" "$PKG_SIGNED"
mkdir -p "$PAYLOAD_DIR/usr/local/bin"
cp "$BIN" "$PAYLOAD_DIR/usr/local/bin/$INSTALL_NAME"

pkgbuild --root "$PAYLOAD_DIR" \
  --identifier "com.${INSTALL_NAME}.cli" \
  --version "$VERSION" \
  --install-location / \
  "$PKG_UNSIGNED"

productsign --sign "$INST_IDENTITY" "$PKG_UNSIGNED" "$PKG_SIGNED"

echo "Notarizing $PKG_SIGNED (profile: $NOTARY_PROFILE)"
xcrun notarytool submit "$PKG_SIGNED" --keychain-profile "$NOTARY_PROFILE" --wait --progress
xcrun stapler staple "$PKG_SIGNED"

echo "Signed and notarized $PKG_SIGNED"
