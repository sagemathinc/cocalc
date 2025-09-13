#!/usr/bin/env bash

# This does a clean build from source of a copy of your
# current cocalc working codebase here, deletes
# a lot that isn't needed for cocalc-project-runner, then
# tars it all up.
#    **The result should be well under 50 MB.**

set -ev

VERSION="$npm_package_version"
MACHINE="$(uname -m)"
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

NAME=cocalc-lite-$VERSION-$MACHINE-$OS
TMP=/tmp/$NAME
rm -rf "$TMP"
mkdir "$TMP"
TARGET="$TMP/$NAME"
SRC="$TARGET/src"

echo "Creating $TARGET"

BIN=`dirname "$(realpath $0)"`

cd "$BIN/../../../.."
(git ls-files -z | tar --null -T - -cf -) | (mkdir -p "$TARGET" && cd "$TARGET" && tar -xf -)

cd "$SRC"/packages
rm -rf database hub next server file-server project-runner

cd "$SRC"
./workspaces.py install --exclude=database,hub,next,server,file-server,project-runner
./workspaces.py build --exclude=database,hub,next,server,file-server,project-runner

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
# note: cytoscape-fcose is a mermaid dep so already bundled up
# this is aa bunch of frontend only stuff
rm -rf d3* @icons+material* katex* slate* react-highlight-words* codemirror* plotly* @plotly* mermaid* cytoscape-fcose* antd* pdfjs* maplibre* mapbox* three* @lumino* @mermaid* sass* webpack* @icons+material '@napi-rs+canvas'*
rm -rf typescript* @tsd+typescript
rm -rf @cocalc+gcloud-pricing-calculator
rm -rf @maplibre*  @orama*
rm -rf caniuse-lite@* cytoscape@* cytoscape-cose-bilkent@*
rm -rf refractor@* rc-picker@* @uiw+react-textarea-code-editor@* ajv@*
rm -rf langium@* moment@* react-dom@* @sinclair+typebox@* @xterm+addon-fit@* @xterm+addon-webgl@* @xterm+addon-web-links@* @xterm+xterm@* yjs@* zlibjs@*  lodash-es@* @swc+helpers@*
rm -rf @jupyter*
rm -rf @asamuzakjp+css-color@* csv-parse@* elementary-circuits-directed-graph@* jquery@* react-timeago@8.3.0_react@* *webpack*
rm -rf @stripe*
rm -rf @dnd-kit*
rm -rf uglify-js*
rm -rf y-protocols*
rm -rf @nteract*
rm -rf dropzone@*

# TODO: rewrite util/db-schema/crm.ts to NOT use @ant-design/colors at all?  This should be in the frontend only.
mkdir x
mv @ant-design* x
mv x/@ant-design+colors* .
rm -rf x

# AI libraries in the server/ package -- this will all get proxied through a cocalc.com server via a subscription, so don't need it here:
rm -rf js-tiktoken* gpt3-tokenizer* openai* @mistralai* @anthropic* @langchain*

if [ `uname` == "Linux" ]; then
  rm -rf zeromq*/node_modules/zeromq/build/darwin/
  rm -rf zeromq*/node_modules/zeromq/build/win32/
fi

if [ `uname` == "Darwin" ]; then
  rm -rf zeromq*/node_modules/zeromq/build/linux/
  rm -rf zeromq*/node_modules/zeromq/build/win32/
fi

if [ `uname` == 'x86_64']; then
  rm -rf zeromq*/node_modules/zeromq/build/*/arm64
fi
if [ `uname` == 'arm64']; then
  rm -rf zeromq*/node_modules/zeromq/build/*/x*64
fi

# Upstream sqlite sources are ~10MB:
rm -rf better-sqlite3@*/node_modules/better-sqlite3/deps/sqlite3

cd "$SRC"/..
rm -rf *.md .github .git docs
mv src/packages/* .
rm -rf src
# remove rustic for now, until we build a backup system for cocalc-lite based on it.
rm -f backend/node_modules/.bin/rustic

cd $TMP
mkdir -p $BIN/../build/lite
tar Jcvf $BIN/../build/lite/$NAME.tar.xz $NAME

rm -rf "$TARGET"