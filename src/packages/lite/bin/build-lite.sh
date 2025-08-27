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
SRC="$TARGET/src"

echo "Creating $TARGET"

BIN=`dirname "$(realpath $0)"`

git clone --depth=1 $BIN/../../../.. $TARGET

cd "$SRC"/packages
rm -rf database hub next server file-server

cd "$SRC"
pnpm build --exclude=database,hub,next,server,file-server

# Delete packages that were only needed for the build.
# Deleting node_modules and installing is the recommended approach by pnpm.
cd "$SRC"/packages
rm -rf node_modules && pnpm install --prod --package-import-method=copy

rm -rf cdn frontend

rm -rf static/dist/*.map static/dist/embed-*.js

cd node_modules/.pnpm
rm -rf @next* next*
rm -rf googleapis* @google*
rm -rf zeromq*/node_modules/zeromq/prebuilds/*win*
rm -rf @types*
rm -rf @img*
rm -rf @rspack*
rm -rf rxjs*
# @zxcvbn is password strength but cocalc-lite doesn't have account creation
rm -rf @zxcvbn* zod*
# jsdom -- used for testing and next
rm -rf jsdom*
# note: cytoscape-fcose is a mermaid dep so alraedy bundled up
# this is aa bunch of frontend only stuff
rm -rf d3* @icons+material* katex* slate* react-highlight-words* codemirror* plotly* @plotly* mermaid* cytoscape-fcose* antd* pdfjs* maplibre* mapbox* three* @lumino* @mermaid* sass* webpack* @icons+material '@napi-rs+canvas'*
rm -rf typescript* @tsd+typescript
rm -rf @cocalc+gcloud-pricing-calculator
rm -rf @maplibre*

# TODO: rewrite util/db-schema/crm.ts to NOT use @ant-design/colors at all?  This should be in the frontend only.
mkdir x
mv @ant-design* x
mv x/@ant-design+colors* .
rm -rf x

# AI libraries in the server/ package -- this will all get proxied through a cocalc.com server via a subscription, so don't need it here:
rm -rf js-tiktoken* gpt3-tokenizer* openai* @mistralai* @anthropic* @langchain*

if [ `uname` == "Linux" ]; then
  rm -rf zeromq*/node_modules/zeromq/build/darwin/
fi

if [ `uname` == "Darwin" ]; then
  rm -rf zeromq*/node_modules/zeromq/build/linux/
fi

cd "$SRC"/..
rm -rf *.md .github .git docs
mv src/packages/* .
rm -rf src
# remove rustic for now, until we build a backup system for cocalc-lite based on it.
rm -f backend/node_modules/.bin/rustic

cd $TMP
tar Jcvf $BIN/../$NAME.tar.xz $NAME

rm -rf "$TARGET"