#!/usr/bin/env bash

set -v

. env.sh

export PROJECT_HOME=$UNIONFS_LOWER
unset UNIONFS_LOWER
unset UNIONFS_UPPER

node ./start-filesystem.js
