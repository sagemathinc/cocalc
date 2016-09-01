#!/usr/bin/env bash

docker run -it --volume /ext:/ext --volume /mnt/compute-disk/:/linux --tmpfs /run:rw,noexec,nosuid,size=65536k --tmpfs /tmp:rw,noexec,nosuid,size=10M empty /bin/bash