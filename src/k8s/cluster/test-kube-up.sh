#!/usr/bin/env bash

set -e


# Create a kubernetes cluster for testing purposes only.

. defaults.sh

export NODE_SIZE=g1-small
export NUM_NODES=2
export MASTER_SIZE=g1-small
export MASTER_DISK_TYPE=pd-standard
export NODE_DISK_TYPE=pd-standard
export NODE_DISK_SIZE=30GB
export PREEMPTIBLE_NODE=true
export KUBE_GCE_INSTANCE_PREFIX=kubetest

time ~/kubernetes/cluster/kube-up.sh
