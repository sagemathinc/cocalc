#!/usr/bin/env bash
# quick script to automate updating the anaconda installation
# !!! might easily break due to subtle changes !!!
set -e
set -v

[[ `whoami` == salvus ]] || (echo "You need to be salvus!"; exit 1)

umask 022

cd ${ANACONDA3:-/ext/anaconda}
. bin/activate root
conda update --all --yes
conda clean --all --yes
. deactivate

# only run push if it exists
hash push 2>/dev/null && push .


