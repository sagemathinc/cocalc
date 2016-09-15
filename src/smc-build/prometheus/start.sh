#!/usr/bin/env bash

# notes
# prometheus installed in ~/gopath/... by compiling with go and symlinking the binary from the bin dir there
# grafana: followed http://docs.grafana.org/installation/debian/ to the point

cd `dirname "$0"`
. prometheus.env

# storage.local.memory-chunks default is 1048576 (docu says it will use 3GB of ram, use a 1/4 of it)
prometheus -config.file=prometheus.yml             \
           -storage.local.path=$DATA               \
           -storage.local.memory-chunks=500000     \
           -storage.local.max-chunks-to-persist=1000000 \
           -storage.local.chunk-encoding-version=2 \

