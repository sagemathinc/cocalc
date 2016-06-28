#!/bin/bash

service ssh start

# Ugly hack to do nothing and wait for SIGTERM
while true; do
    sleep 5
done
