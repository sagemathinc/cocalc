#!/usr/bin/env bash

set -v

. env.sh

fusermount -uz $UNIONFS_LOWER 2>/dev/null || true


export PROJECT_HOME=$UNIONFS_LOWER
unset UNIONFS_LOWER
unset UNIONFS_UPPER

node ./start-filesystem.js
