#!/usr/bin/env bash
set -ev


export SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

export SRC="$SCRIPT_DIR"/../../

mkdir -p smc-webapp
cp $SRC/smc-webapp/file-associations.ts smc-webapp/

mkdir -p smc-webapp/codemirror/
rsync -axvH $SRC/smc-webapp/codemirror/styles.js smc-webapp/codemirror/styles.js
rsync -axvH $SRC/smc-webapp/codemirror/static.tsx smc-webapp/codemirror/static.tsx
rsync -axvH $SRC/smc-webapp/codemirror/modes.js smc-webapp/codemirror/modes.js
rsync -axvH $SRC/smc-webapp/codemirror/mode/ smc-webapp/codemirror/mode/