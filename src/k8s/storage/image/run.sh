#!/bin/bash
set -e
set -v

# Test image to serve
truncate -s 5G /tmp/test.img

ietd --foreground --uid=0 --gid=0 --config=/etc/ietd/ietd.conf