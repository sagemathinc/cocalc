#!/usr/bin/env bash

set -e

# see https://github.com/kubernetes/kubernetes/blob/master/cluster/gce/config-default.sh

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
export KUBE_ENABLE_CLUSTER_MONITORING=google
export KUBE_ENABLE_NODE_AUTOSCALER=true
export KUBE_AUTOSCALER_MIN_NODES=2
export KUBE_AUTOSCALER_MAX_NODES=6

time ~/kubernetes/cluster/kube-up.sh
