#!/usr/bin/env bash

# Set the default context for kubectl commands. Use this to switch between kubectl
# defaulting to different clusters.   For example,
#
#     ./select-context.sh test
#     ./select-context.sh prod

# append default PROJECT_ID_ to beginning of name.

set -e

if [ x"$1" = "x" ]; then
    echo "specify the name of the context"
    exit 1
fi

export CONTEXT="`gcloud compute project-info describe|grep name | cut -c 7-`_$1"

kubectl config use-context "$CONTEXT"