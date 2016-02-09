#!/usr/bin/env bash
# quick script to automate updating the anaconda installation
# !!! might easily break due to subtle changes !!!
set -e
set -v

[[ `whoami` == salvus ]] || (echo "You need to be salvus!"; exit 1)

umask 022

cd /projects/anaconda3
. bin/activate root
conda update --all --yes
conda clean --tarballs --source-cache --yes
. deactivate

push .


