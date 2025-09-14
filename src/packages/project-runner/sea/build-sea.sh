#!/usr/bin/env bash
set -Eeuo pipefail

NAME="cocalc-project-runner"

export VERSION="$npm_package_version"
FUSE="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"   # must match your sea-config.json
MACHINE="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

TARGET="./$NAME-$VERSION-$MACHINE-$OS"

NODE_BIN="$(command -v node)"

echo "Building CoCalc Project Runner SEA for $OS"

# 1) Stage the node runtime we’ll inject into
cp "$NODE_BIN" "$TARGET"
chmod u+w "$TARGET"

cp ../build/tarball/$NAME-$VERSION-$MACHINE-$OS.tar.xz $NAME.tar.xz
envsubst < cocalc-template.js > cocalc.js

# 2) Bundle app into a SEA blob
#    This writes ./sea-prep.blob using your sea-config.json
node --experimental-sea-config sea-config.json

# 3) Platform-specific injection and signing
case "$OS" in
  darwin)
    # Remove existing signature before mutation (ok if it fails on already-unsigned copy)
    codesign --remove-signature "$TARGET" || true

    # Inject the SEA blob into the Mach-O binary, specifying the segment name for macOS
    npx -y postject "$TARGET" NODE_SEA_BLOB ./sea-prep.blob \
      --sentinel-fuse "$FUSE" \
      --macho-segment-name NODE_SEA

    # Re-sign ad-hoc so macOS will run it
    codesign --force --sign - "$TARGET"
    ;;

  linux)
    # Inject into the ELF binary (no Mach-O segment flag on Linux)
    npx -y postject "$TARGET" NODE_SEA_BLOB ./sea-prep.blob \
      --sentinel-fuse "$FUSE"
    ;;

  *)
    echo "Unsupported OS: $OS" >&2
    exit 2
    ;;
esac

rm cocalc.js $NAME.tar.xz sea-prep.blob


mv $TARGET $NAME
mkdir $TARGET
mv $NAME $TARGET
tar Jcvf $TARGET.tar.xz $TARGET
rm -rf $TARGET

mkdir -p ../build/sea
mv $TARGET.tar.xz ../build/sea

cd ../build/sea

ls -lh $TARGET.tar.xz

echo "Built `pwd`/$TARGET.tar.xz"

