#!/usr/bin/env bash
set -e

dist="lib/software-inventory"
mkdir -p $dist

# download and copy a single file
download_and_copy() {
    name=$1
    fn="software-inventory-$name.json"
    local="software-inventory/$name.json"
    targ="$dist/$name.json"

    if [[ ! -L "$local" ]]; then
        if ! curl --silent --show-error --fail "https://storage.googleapis.com/cocalc-compute-environment/$fn" -o "$local"; then
            echo "Error: Failed to download $fn" >&2
            return 1
        fi
    fi

    cp -v "$local" "$targ"
}

# we now run all downloads in parallel, wait for them, and check if any of them failed...
pids=()

# Start downloads in parallel
for name in "20.04" "22.04" "24.04"; do
    download_and_copy "$name" &
    pids+=($!)
done

# Wait for all background processes to finish
for pid in "${pids[@]}"; do
    if ! wait $pid; then
        echo "Error: One or more downloads failed" >&2
        exit 1
    fi
done
