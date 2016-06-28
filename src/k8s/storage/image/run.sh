#!/bin/bash

# Enable very fast (but less secure) cipher; all we need since already on a LAN.
echo "Ciphers arcfour128">>/etc/ssh/sshd_config

service ssh start

# Ugly hack to do nothing and wait for SIGTERM
while true; do
    sleep 5
done
