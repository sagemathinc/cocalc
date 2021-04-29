#!/usr/bin/env bash
set -ev


export SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR"

export SRC="$SCRIPT_DIR"/../../

mkdir -p smc-webapp
cp $SRC/smc-webapp/file-associations.ts smc-webapp/