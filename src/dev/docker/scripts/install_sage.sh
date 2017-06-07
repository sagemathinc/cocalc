#!/bin/bash
# !!!NOTE!!! This script is intended to be run with root privileges
# It will run as the 'sage' user when the time is right.
SAGE_SRC_TARGET=${1%/}
BRANCH=$2

if [ -z $SAGE_SRC_TARGET ]; then
  >&2 echo "Must specify a target directory for the sage source checkout"
  exit 1
fi

if [ -z $BRANCH ]; then
  >&2 echo "Must specify a branch to build"
  exit 1
fi

N_CORES=$(cat /proc/cpuinfo | grep processor | wc -l)

export SAGE_FAT_BINARY="yes"
# Just to be sure Sage doesn't try to build its own GCC (even though
# it shouldn't with a recent GCC package from the system and with gfortran)
export SAGE_INSTALL_GCC="no"
export MAKE="make -j${N_CORES}"
cd "$SAGE_SRC_TARGET"
git clone --depth 1 --branch ${BRANCH} https://github.com/sagemath/sage.git
chown -R sage:sage sage
cd sage

# Sage can't be built as root, for reasons...
# Here -E inherits the environment from root, however it's important to
# include -H to set HOME=/home/sage, otherwise DOT_SAGE will not be set
# correctly and the build will fail!
sudo -H -E -u sage make
# Stupid static GMP's get left around that break the build.
rm "$SAGE_SRC_TARGET"/sage/local/lib/libgmp*.a
# Try again with the static GMP's removed.
sudo -H -E -u sage make || exit 1

# Add aliases for sage and sagemath
ln -sf "${SAGE_SRC_TARGET}/sage/sage" /usr/bin/sage
ln -sf "${SAGE_SRC_TARGET}/sage/sage" /usr/bin/sagemath

# Clean up artifacts from the sage build that we don't need for runtime or
# running the tests
#
# Unfortunately none of the existing make targets for sage cover this ground
# exactly

# For the 'develop' image we leave everything as it would be after a
# successful sage build
if [ $BRANCH != "develop" ]; then
  make misc-clean
  make -C src/ clean

  rm -rf upstream/
  rm -rf src/doc/output/doctrees/

  # Strip binaries
  LC_ALL=C find local/lib local/bin -type f -exec strip '{}' ';' 2>&1 | grep -v "File format not recognized" |  grep -v "File truncated" || true
fi
