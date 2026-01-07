#!/usr/bin/env bash
set -Eeuo pipefail

export NAME="cocalc-project"
export MAIN="bundle/index.js"
export VERSION="$npm_package_version"

FUSE="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
ARCH="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
esac

TARGET="./$NAME-$VERSION-$ARCH-$OS"

NODE_BIN="$(command -v node)"

echo "Building CoCalc Project SEA for $OS"

cp "$NODE_BIN" "$TARGET"
chmod u+w "$TARGET"

cp ../build/bundle-${OS}-${ARCH}.tar.xz cocalc.tar.xz
envsubst < ../../project-host/sea/cocalc-template.js > cocalc.js

node --experimental-sea-config sea-config.json

case "$OS" in
  darwin)
    codesign --remove-signature "$TARGET" || true
    npx -y postject "$TARGET" NODE_SEA_BLOB ./sea-prep.blob \
      --sentinel-fuse "$FUSE" \
      --macho-segment-name NODE_SEA
    codesign --force --sign - "$TARGET"
    ;;
  linux)
    npx -y postject "$TARGET" NODE_SEA_BLOB ./sea-prep.blob \
      --sentinel-fuse "$FUSE"
    ;;
  *)
    echo "Unsupported OS: $OS" >&2
    exit 2
    ;;
esac

rm cocalc.js cocalc.tar.xz sea-prep.blob

mv $TARGET $NAME
mkdir $TARGET
mv $NAME $TARGET
cd $TARGET
ln -s $NAME node
cd ..
tar Jcvf $TARGET.tar.xz $TARGET
rm -rf $TARGET

mkdir -p ../build/sea
mv $TARGET.tar.xz ../build/sea

cd ../build/sea
ls -lh $TARGET.tar.xz

echo "Built $(pwd)/$TARGET.tar.xz"
