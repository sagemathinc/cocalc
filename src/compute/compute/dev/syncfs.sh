#!/usr/bin/env bash

set -v

. env.sh

fusermount -uz $UNIONFS_UPPER 2>/dev/null || true

node ./start-filesystem.js
