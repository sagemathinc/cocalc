#!/usr/bin/env bash

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

MUTAGEN_SSH_PATH="$SCRIPT_DIR"/mutagen.bin PATH="$SCRIPT_DIR"/mutagen.bin "$SCRIPT_DIR"/mutagen "$@"