#!/bin/sh
set -e
set -v

cat /etc/ssh/sshd_config.custom >> /etc/ssh/sshd_config

mkdir /root/.ssh
cp /ssh/id-rsa.pub /root/.ssh/authorized_keys
chmod og-rwx -R /root/.ssh

/usr/sbin/sshd -D

