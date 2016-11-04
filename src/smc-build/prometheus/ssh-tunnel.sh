#!/usr/bin/env bash
# uses gcloud computes ssh key to connect to admin0

admin0ip=`gcloud --format="value(networkInterfaces[0].accessConfigs[0].natIP)" compute instances describe admin0`
port=${1:-3000}
echo "forwarding from $admin0ip with portnumber $port"

while true; do
ssh -CNL $port:localhost:$port \
    -i ~/.ssh/google_compute_engine \
    -o UserKnownHostsFile=~/.ssh/google_compute_known_hosts \
    -o IdentitiesOnly=yes -o CheckHostIP=no \
    -o StrictHostKeyChecking=no \
    salvus@$admin0ip
test $? -ne 0 && exit 1 
sleep 1
echo "reconnecting ..."
done
