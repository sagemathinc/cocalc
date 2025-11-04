#!/usr/bin/env bash
set -ev

BIN=node_modules/.bin
cp "`pwd`/dist/bin/open.js" $BIN/open
chmod +x $BIN/open

rm $BIN/reflect $BIN/reflect-sync
pnpm reflect install $BIN
