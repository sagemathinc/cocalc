#!/usr/bin/env bash
set -ev

BIN=node_modules/.bin
TMP=node_modules/.tmp
mkdir -p $TMP
cp "`pwd`/dist/bin/open.js" $BIN/open
chmod +x $BIN/open

pnpm reflect install $TMP
mv $TMP/reflect $TMP/reflect-sync $BIN
