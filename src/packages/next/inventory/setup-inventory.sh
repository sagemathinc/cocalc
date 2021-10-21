#!/usr/bin/env bash
set -e

mkdir -p dist/inventory

# don't update inventory files if they're symlinks – used for local testing
for fn in compute-inventory.json compute-components.json; do
    local="inventory/$fn"
    targ="dist/inventory/$fn"

    if [[ ! -L "$local" ]]; then
        curl "https://storage.googleapis.com/cocalc-compute-environment/$fn" -o "$local"
    fi

    if [[ ! -f "$targ" ]]; then
        cp -v "$local" "$targ"
    fi
done
