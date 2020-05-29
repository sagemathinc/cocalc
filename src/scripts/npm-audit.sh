#!/usr/bin/env bash

set -e
set -v

. scripts/cocalc-dirs.sh

for dir in "${CODE_DIRS[@]}"; do
    cd "$dir"
    printf "\n\n========== SCANNING $dir ==========\n\n"
    npm audit $1 || true
done

