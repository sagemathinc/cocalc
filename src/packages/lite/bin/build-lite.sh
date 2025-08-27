#!/usr/bin/env bash

# This does a clean build from source of a clone
# of the cocalc repo where it is run from, deletes
# a lot that isn't needed for cocalc-lite, then
# tars it all up.  The result should be about 150MB.

set -ev

NAME=cocalc-lite
TMP=/tmp/$NAME
mkdir $TMP
TARGET="$TMP/$NAME"

echo "Creating $TARGET"

BIN=`dirname "$(realpath $0)"`

git clone --depth=1 $BIN/../../../.. $TARGET
chmod a+r "$TARGET"
cd "$TARGET"/src

pnpm build --exclude=next,hub,server,database,file-server

rm -rf "$TARGET"/.git

# Delete packages that were only needed for the build.
# Deleting node_modules and installing is the recommended approach by pnpm.
cd packages
rm -rf node_modules && pnpm install --prod --package-import-method=copy

rm -rf  database hub next server frontend cdn file-server

rm -rf static/dist/*.map static/dist/embed-*.js

cd node_modules/.pnpm
rm -rf @next* next*
rm -rf googleapis* @google*
rm -rf zeromq*/node_modules/zeromq/prebuilds/*win*
rm -rf @types*
rm -rf @img*
rm -rf @rspack*
rm -rf plotly* mermaid* antd* pdfjs* maplibre* mapbox* three* @lumino* @mermaid* sass* webpack* @icons+material '@napi-rs+canvas'*
rm -rf typescript* @tsd+typescript@4.7.4

# TODO: rewrite util/db-schema/crm.ts to NOT use @ant-design/colors at all?  This should be in the frontend only.
mkdir x
mv @ant-design* x
mv x/@ant-design+colors* .
rm -rf x

# This is weird/scary and doesn't work on macos:
# cd ../..
# curl -sf https://gobinaries.com/tj/node-prune  | PREFIX=/tmp sh
# node-prune -include '**win32**'

cd "$TARGET"
rm -rf *.md .* docs
mv src/packages/* .
rm -rf src
# remove rustic for now, until we build a backup system for cocalc-lite based on it.
rm -f backend/node_modules/.bin/rustic

cd $TMP
tar zcvf $BIN/../$NAME.tar.gz $NAME

rm -rf "$TARGET"