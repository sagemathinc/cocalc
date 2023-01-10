#!/usr/bin/env bash
set -ev

export CWD=`pwd`

# There are a bunch of random auto-generated bits and pieces in assets.
# This is really bad (IMHO), but at least I can automate it here in this script.

# Create the snippets/examples json data.
# This happens to be done by checking out a submodule somewhere
# and running make.
cd "$CWD"/../..
git submodule update --init
cd examples
OUTDIR="$CWD"/examples make

