#!/usr/bin/env bash
set -Eeuo pipefail

# --- config ---
FUSE="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"   # must match your sea-config.json
TARGET="./cocalc"                                       # final single-file executable
NODE_BIN="$(command -v node)"
OS="$(uname -s)"

echo "Building SEA for $OS"

# 1) Stage the node runtime we’ll inject into
cp "$NODE_BIN" "$TARGET"
chmod u+w "$TARGET"   # make sure it's writable even if copied from system paths

cp ../cocalc-lite.tar.gz . || true

# 2) Bundle app into a SEA blob
#    This writes ./sea-prep.blob using your sea-config.json
node --experimental-sea-config sea-config.json

# 3) Platform-specific injection and signing
case "$OS" in
  Darwin)
    # Remove existing signature before mutation (ok if it fails on already-unsigned copy)
    codesign --remove-signature "$TARGET" || true

    # Inject the SEA blob into the Mach-O binary, specifying the segment name for macOS
    npx -y postject "$TARGET" NODE_SEA_BLOB ./sea-prep.blob \
      --sentinel-fuse "$FUSE" \
      --macho-segment-name NODE_SEA

    # Re-sign ad-hoc so macOS will run it
    codesign --force --sign - "$TARGET"
    ;;

  Linux)
    # Inject into the ELF binary (no Mach-O segment flag on Linux)
    npx -y postject "$TARGET" NODE_SEA_BLOB ./sea-prep.blob \
      --sentinel-fuse "$FUSE"
    ;;

  *)
    echo "Unsupported OS: $OS" >&2
    exit 2
    ;;
esac


echo "Done. Built $TARGET"
