#!/usr/bin/env bash
# quick script to automate updating the anaconda installation
# !!! might easily break due to subtle changes !!!
set -e
set -v

[[ `whoami` == salvus ]] || (echo "You need to be salvus!"; exit 1)

ANACONDA=${ANACONDA3:-/ext/anaconda}

umask 022

cd $ANACONDA
. bin/activate root
conda update --all --yes
conda clean --all --yes
. deactivate

# fix permissions (umask 022 not always works)
chmod a+r -R . || true
find . -perm /u+x -execdir chmod a+x {} \; || true

# only run push if it exists
hash push 2>/dev/null && push $ANACONDA


