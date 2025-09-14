#!/usr/bin/env bash
set -euo pipefail

# -------------------------------------------------------------------------
# Versions (override with env vars if you like)
: "${DROPBEAR_VERSION:=2025.88}"
: "${ZIG_VERSION:=0.15.1}"
: "${JOBS:=8}"                     # parallelism for make
# -------------------------------------------------------------------------

# --- Arch → Zig package ---------------------------------------------------
arch="$(uname -m)"
case "$arch" in
  x86_64)   zig_pkg="zig-x86_64-linux-${ZIG_VERSION}.tar.xz";  zig_dir="zig-x86_64-linux-${ZIG_VERSION}"; target="x86_64-linux-musl" ;;
  aarch64)  zig_pkg="zig-aarch64-linux-${ZIG_VERSION}.tar.xz"; zig_dir="zig-aarch64-linux-${ZIG_VERSION}"; target="aarch64-linux-musl" ;;
  *)
    echo "Unsupported arch: $arch (expected x86_64 or aarch64)" >&2
    exit 1
    ;;
esac

zig_url="https://ziglang.org/download/${ZIG_VERSION}/${zig_pkg}"
dropbear_url="https://matt.ucc.asn.au/dropbear/releases/dropbear-${DROPBEAR_VERSION}.tar.bz2"

# --- Temp dirs ------------------------------------------------------------
workdir="$(pwd)"
builddir="$(mktemp -d)"
trap 'rm -rf "$builddir"' EXIT

# --- Download & unpack Zig ------------------------------------------------
echo "Downloading Zig ${ZIG_VERSION} (${arch})..."
curl -fsSL "$zig_url" -o "${builddir}/${zig_pkg}"

echo "Extracting Zig..."
tar -C "$builddir" -xJf "${builddir}/${zig_pkg}"
export PATH="${builddir}/${zig_dir}:$PATH"
ls ${builddir}/${zig_dir}

echo "Zig version: $(zig version)"

# --- Download & unpack Dropbear -------------------------------------------
echo "Downloading Dropbear ${DROPBEAR_VERSION}..."
curl -fsSL "$dropbear_url" -o "${builddir}/dropbear-${DROPBEAR_VERSION}.tar.bz2"

echo "Extracting Dropbear..."
tar -C "$builddir" -xjf "${builddir}/dropbear-${DROPBEAR_VERSION}.tar.bz2"
cd "${builddir}/dropbear-${DROPBEAR_VERSION}"

# --- Configure & build ----------------------------------------------------
echo "Cleaning previous build (if any)..."
make clean || true

echo "Configuring Dropbear for target ${target}..."
CC="zig cc -target ${target}" \
CFLAGS="-Os -fno-pie" \
LDFLAGS="-static -no-pie" \
./configure \
  --host="${target}" \
  --disable-pam \
  --disable-zlib \
  --enable-bundled-libtom \
  --enable-static

echo "Building dropbearmulti (static)..."
make -j "${JOBS}" PROGRAMS="dropbear dropbearkey" STATIC=1 MULTI=1

if [[ ! -x ./dropbearmulti ]]; then
  echo "Error: dropbearmulti not produced" >&2
  exit 1
fi

echo "Stripping binary..."
strip ./dropbearmulti || true

# Copy result back to starting dir
cp ./dropbearmulti "$workdir/"
echo "Build complete."
echo "Static binary available at: $workdir/dropbearmulti"
ln -sf dropbearmulti dropbear
ln -sf dropbearmulti dropbearkey
