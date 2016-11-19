#!/usr/bin/env bash

# notes
# prometheus installed in ~/gopath/... by compiling with go and symlinking the binary from the bin dir there
# grafana: followed http://docs.grafana.org/installation/debian/ to the point

cd `dirname "$0"`
. prometheus.env

# storage.local.memory-chunks default is 1048576 (docu says it will use 3GB of ram, use a 1/4 of it)
nice ionice -c3 \
prometheus -config.file=prometheus.yml             \
           -storage.local.path=$DATA               \
           -storage.local.memory-chunks=150000     \
           -storage.local.max-chunks-to-persist=150000 \
           -storage.local.chunk-encoding-version=2 \
           -storage.local.retention=1000h0m0s       \
           -alertmanager.url=http://localhost:9093/
