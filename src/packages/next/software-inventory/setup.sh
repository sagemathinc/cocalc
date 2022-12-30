#!/usr/bin/env bash
set -e

dist="dist/software-inventory"
mkdir -p $dist

# don't update inventory files if they're symlinks – used for local testing
for name in "18.04" "20.04" "22.04"; do
    fn="software-inventory-$name.json"
    local="software-inventory/$name.json"
    targ="$dist/$name.json"

    if [[ ! -L "$local" ]]; then
        curl --silent --show-error --fail "https://storage.googleapis.com/cocalc-compute-environment/$fn" -o "$local"
    fi

    if [[ ! -f "$targ" ]]; then
        cp -v "$local" "$targ"
    fi
done
