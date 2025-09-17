#!/usr/bin/env bash
set -ev

cp "`pwd`/dist/bin/open.js" node_modules/.bin/open
chmod +x node_modules/.bin/open

cp "`pwd`/dist/bin/sync-mtime-ssh.js" node_modules/.bin/sync-mtime-ssh
chmod +x node_modules/.bin/sync-mtime-ssh


mkdir -p node_modules/.bin/mutagen.bin
cp "`pwd`/bin/dbclient-wrapper.sh" node_modules/.bin/mutagen.bin/ssh
chmod +x  node_modules/.bin/mutagen.bin/ssh
