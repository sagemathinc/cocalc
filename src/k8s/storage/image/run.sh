#!/bin/sh

rm -rf /var/lib/glusterd
mkdir -p /brick/glusterd
ln -s /brick/glusterd /var/lib/glusterd
service glusterfs-server start

while true; do
    sleep 5
done
