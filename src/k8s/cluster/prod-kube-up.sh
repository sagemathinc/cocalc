#!/usr/bin/env bash

set -e


# Create a (pre-emptible) kubernetes cluster for serious production use.

. defaults.sh

export NODE_SIZE=n1-standard-4
export NUM_NODES=3
export MASTER_SIZE=n1-standard-1
export MASTER_DISK_TYPE=pd-standard
export NODE_DISK_TYPE=pd-standard
export NODE_DISK_SIZE=80GB
export PREEMPTIBLE_NODE=true
export KUBE_GCE_INSTANCE_PREFIX=kubeprod

time ~/kubernetes/cluster/kube-up.sh
