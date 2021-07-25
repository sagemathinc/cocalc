#!/usr/bin/env bash
set -ev

export CWD=`pwd`

# There are a bunch of random auto-generated bits and pieces in webapp-lib.
# This is really bad (IMHO), but at least I can automate it here in this script.

# Create the snippets/examples json data.
# This happens to be done by checking out a submodule somewhere
# and running make.
cd "$CWD"/..
git submodule update --init
. smc-env
cd examples
OUTDIR=../webapp-lib/examples make


# Finally create the compute inventory.  Again, this
# has no business in an "assets" module, but here we are.
# For now this is the one for cocalc.com, which is
# of course wrong anywhere else:
cd "$CWD"
curl https://storage.googleapis.com/cocalc-compute-environment/compute-components.json > compute-components.json
curl https://storage.googleapis.com/cocalc-compute-environment/compute-inventory.json > compute-inventory.json
