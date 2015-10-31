#!/usr/bin/env bash

# This works to build QEPCAD, but it doesn't actually work as far as I can tell.  Leaving it here in case want to pick this up later.
# Not work = hangs when attempted from Sage.
#          = example on their webpage doesn't work.

set -e

cd /usr/local/sage
mkdir -p qepcad
cd qepcad
ls
wget http://www.usna.edu/CS/~qepcad/INSTALL/saclib2.2.6.tar.gz
wget http://www.usna.edu/CS/~qepcad/INSTALL/qepcad-B.1.69.tar.gz
tar xf saclib2.2.6.tar.gz
tar xf qepcad-B.1.69.tar.gz
rm *.tar.gz
cd saclib2.2.6/
export saclib=`pwd`
cd bin
./sconf
./mkproto
./mkmake
./mklib all
cd ../..
cd qesource
export qe=`pwd`
make
echo "SINGULAR /usr/local/bin/" >> $qe/default.qepcadrc
cd $qe/cad2d
make
cd $qe/..
echo 'qe=/usr/local/sage/qepcad/qesource /usr/local/sage/qepcad/qesource/bin/qepcad "$@"' > qepcad
chmod a+x qepcad
chmod a+r -R *
cp qepcad /usr/local/sage/current/local/bin/qepcad
cp qesource/bin/qepcad.help /usr/local/sage/current/local/bin/