#!/usr/bin/env bash

# This does a clean build from source of a clone
# of the cocalc repo where it is run from, deletes
# a lot that isn't needed for cocalc-lite, then
# tars it all up.  The result should be about 150MB.

set -ev

TMP=/tmp/cocalc-lite
mkdir $TMP
TARGET="$TMP/cocalc-lite"

BIN=`dirname "$(realpath $0)"`
    
git clone --depth=1 $BIN/../../../.. $TARGET
chmod a+r "$TARGET"
cd "$TARGET"/src

pnpm build --exclude=next,hub,server,database,file-server

rm -rf "$TARGET"/.git

# Delete packages that were only needed for the build.
# Deleting node_modules and installing is the recommended approach by pnpm.
cd packages
rm -rf node_modules && pnpm install --prod

rm -rf  database hub next server frontend assets cdn file-server

rm -rf static/dist/*.map static/dist/embed-*.js

cd node_modules/.pnpm
rm -rf @next* next*
rm -rf googleapis* @google*
rm -rf zeromq*/node_modules/zeromq/prebuilds/*win*
rm -rf @types*
rm -rf @rspack*
rm -rf plotly* mermaid* antd* pdfjs* maplibre* mapbox* three* @lumino* @mermaid* sass* webpack* @icons+material '@napi-rs+canvas'*
rm -rf typescript* @tsd+typescript@4.7.4

cd ../..
curl -sf https://gobinaries.com/tj/node-prune  | PREFIX=/tmp sh
node-prune -include '**win32**'

cd $TMP
tar zcvf $BIN/../cocalc-lite.tar.gz cocalc-lite