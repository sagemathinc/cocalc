#!/usr/bin/env bash
# fixes the permissions to 022
DIR=${1:-.}
time chmod a+r -R $DIR && find $DIR -perm /u+x -execdir chmod a+x {} \; && echo "OK"
