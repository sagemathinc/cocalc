#!/usr/bin/env bash

# Shut down the cluster with the given context.  For example,
#
#     ./kube-down.sh test
#     ./kube-down.sh prod

set -e

. defaults.sh

./select-context.sh $1

export KUBE_GCE_INSTANCE_PREFIX=$1

~/kubernetes/cluster/kube-down.sh
