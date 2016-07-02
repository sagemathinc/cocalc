#!/bin/bash

# Enable very fast (but less secure) cipher; all we need since already on a LAN.
echo "Ciphers arcfour128"             >> /etc/ssh/sshd_config
# Security: make it so ssh to storage machine can *ONLY* be used
# to sshfs mount /data and nothing else.  Not critical, but might as well reduce attack surfaces.
echo "Match User root"                >> /etc/ssh/sshd_config
echo "    ChrootDirectory /data"      >> /etc/ssh/sshd_config
echo "    ForceCommand internal-sftp" >> /etc/ssh/sshd_config



# Copy over ssh keys from the k8s secret
mkdir -p /root/.ssh
cp /ssh/id-rsa /root/.ssh/id_rsa
cp /ssh/id-rsa.pub /root/.ssh/id_rsa.pub
cp /ssh/id-rsa.pub /root/.ssh/authorized_keys
chmod og-rwx -R /root/.ssh

service ssh start

# Wait for SIGTERM
while true; do
    sleep 5
done
